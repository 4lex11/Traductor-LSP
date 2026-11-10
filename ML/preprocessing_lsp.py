"""Representación común de Holistic para entrenamiento y futura inferencia.

No modifica etiquetas, no refleja imágenes y no interpola puntos ausentes.
"""
from typing import Any

import numpy as np

GROUPS = (('left_hand_landmarks', 21), ('right_hand_landmarks', 21),
          ('pose_landmarks', 33), ('face_landmarks', 478))
POINTS = sum(size for _, size in GROUPS)


def pack_landmarks(result: Any, pose_visibility: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Orden fijo: izquierda, derecha, cuerpo, rostro; ausencia explícita."""
    raw = np.zeros((POINTS, 3), dtype=np.float32)
    mask = np.zeros(POINTS, dtype=bool)
    offset = 0
    for name, count in GROUPS:
        landmarks = getattr(result, name)
        if landmarks and len(landmarks) != count:
            raise ValueError(f'{name}: se esperaban {count} puntos; recibidos {len(landmarks)}')
        for index, point in enumerate(landmarks):
            coords = np.array([point.x, point.y, point.z], dtype=np.float32)
            visibility = getattr(point, 'visibility', None)
            valid = bool(np.isfinite(coords).all())
            if name == 'pose_landmarks' and visibility is not None:
                valid = valid and visibility >= pose_visibility
            if valid:
                raw[offset+index] = coords
                mask[offset+index] = True
        offset += count
    return raw, mask


def normalize_holistic(raw: np.ndarray, mask: np.ndarray, width: int, height: int) -> tuple[np.ndarray, bool]:
    """XY común centrado en hombros, escala de hombros; Z relativo por grupo.

    Z de manos/cuerpo/rostro tiene orígenes diferentes en MediaPipe: no se
    interpreta como profundidad global ni se resta el Z del cuerpo a la cara.
    Sin hombros fiables devuelve ceros y False; raw/mask siguen disponibles.
    """
    out = np.zeros_like(raw)
    left, right = 42+11, 42+12
    if width <= 0 or height <= 0 or not (mask[left] and mask[right]):
        return out, False
    adjusted = raw.copy()
    adjusted[:, 1] *= height/width
    origin = (adjusted[left, :2]+adjusted[right, :2])/2
    scale = float(np.linalg.norm(adjusted[left, :2]-adjusted[right, :2]))
    if not np.isfinite(scale) or scale <= 1e-6:
        return out, False
    out[mask, :2] = (adjusted[mask, :2]-origin)/scale
    offset = 0
    # Muñecas para manos; punto medio de hombros para pose; nariz (1) para cara.
    for name, count in GROUPS:
        valid = mask[offset:offset+count]
        anchor_index = offset+(1 if name=='face_landmarks' else 0)
        anchor_z = (raw[left, 2]+raw[right, 2])/2 if name=='pose_landmarks' else raw[anchor_index, 2]
        if name=='pose_landmarks' or mask[anchor_index]:
            out[offset:offset+count, 2][valid] = (raw[offset:offset+count, 2][valid]-anchor_z)/scale
        offset += count
    return out, True


def normalize_hands(raw: np.ndarray, mask: np.ndarray, width: int, height: int) -> tuple[np.ndarray, bool]:
    """Baseline de 126 valores: muñeca/palma de mano izquierda, o derecha.

    Conserva posición relativa de las dos manos; las ausentes siguen en cero.
    No es intercambiable con la normalización del modelo antiguo.
    """
    out = np.zeros((42, 3), dtype=np.float32)
    adjusted = raw[:42].copy()
    adjusted[:, 1] *= height/width
    for start in (0, 21):
        if mask[start] and mask[start+9]:
            scale = float(np.linalg.norm(adjusted[start+9, :2]-adjusted[start, :2]))
            if scale > 1e-6:
                out[mask[:42]] = (adjusted[mask[:42]]-adjusted[start])/scale
                return out.reshape(-1), True
    return out.reshape(-1), False


def choose_frame(timestamp_ms: float, next_sample_ms: float, period_ms: float) -> tuple[bool, float]:
    """Selecciona el primer frame real que alcanza cada instante de muestreo.

    No duplica frames cuando el FPS del video es menor que el FPS objetivo.
    """
    if timestamp_ms+1e-6 < next_sample_ms:
        return False, next_sample_ms
    return True, (int((timestamp_ms+1e-6)//period_ms)+1)*period_ms
