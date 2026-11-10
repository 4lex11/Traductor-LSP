"""Contrato de inferencia experimental. Reutiliza código congelado de ML."""
import hashlib
import json
from pathlib import Path
import sys
from time import perf_counter

import numpy as np
import torch

ML = Path(__file__).resolve().parent.parent / 'ML'
sys.path.insert(0, str(ML))
from preprocessing_lsp import normalize_hands
from train_sprint4 import SETTINGS, SequenceClassifier, inputs

CONTRACT = 'holistic-hands-raw-v1'
EXTRACTOR_RUNTIME = 'holistic-wasm-1.2.0-cpu-v1'
EXTRACTOR_SHA = 'e2dab61191e2dcd0a15f943d8e3ed1dce13c82dfa597b9dd39f562975a50c3f8'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(raw, mask, times, width, height):
    raw = np.asarray(raw, dtype=np.float32).reshape(-1, 42, 3)
    mask = np.asarray(mask, dtype=bool)
    values, masks = [], []
    for frame, present in zip(raw, mask):
        full = np.zeros((553, 3), dtype=np.float32)
        full_mask = np.zeros(553, dtype=bool)
        full[:42], full_mask[:42] = frame, present
        normalized, valid = normalize_hands(full, full_mask, width, height)
        values.append(normalized)
        masks.append(present & valid)
    relative = np.asarray(times, dtype=np.float64)
    relative -= relative[0]
    data = dict(hands=np.asarray(values)[None], hands_mask=np.asarray(masks)[None],
                times_ms=relative[None], lengths=np.array([len(raw)]),
                frame_mask=np.ones((1, len(raw)), dtype=bool), y=np.array([0]))
    x, lengths, _ = inputs(data, 'hands')
    return x, lengths, float(mask.any(axis=1).mean()), float(np.asarray(masks).any(axis=1).mean())


class Recognizer:
    def __init__(self, path):
        metadata = json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
        if digest(path) != metadata['sha256']:
            raise ValueError('El hash del modelo no coincide')
        for name, expected in metadata['codigo_ml_sha256'].items():
            if digest(ML / name) != expected:
                raise ValueError(f'Contrato ML distinto: {name}')
        checkpoint = torch.load(path, map_location='cpu', weights_only=True)
        if checkpoint['representation'] != 'hands' or checkpoint['settings'] != SETTINGS:
            raise ValueError('Arquitectura de checkpoint incompatible')
        if checkpoint['input_size'] != 169 or checkpoint['input_contract'] != 'sprint3_normalized_coords_point_mask_delta_seconds_v1':
            raise ValueError('Contrato de entrada incompatible')
        if checkpoint.get('extractor_runtime') != EXTRACTOR_RUNTIME:
            raise ValueError('Runtime de extracción incompatible con el checkpoint')
        self.parity_validated = False
        proof = path.parent / 'parity.json'
        if metadata.get('parity_sha256') and proof.is_file():
            if digest(proof) != metadata['parity_sha256']:
                raise ValueError('Evidencia de paridad modificada')
            evidence = json.loads(proof.read_text(encoding='utf-8'))
            self.parity_validated = evidence.get('passed') is True and evidence.get('runtime') == EXTRACTOR_RUNTIME
        self.model = SequenceClassifier(169, checkpoint['classes']).eval()
        self.model.load_state_dict(checkpoint['state_dict'])
        mapping = checkpoint['label_map']
        self.classes = [''] * checkpoint['classes']
        for row in mapping['clases']:
            self.classes[mapping['label_to_idx'][row['clase_fuente_id']]] = row['glosa_original']
        self.identifier = metadata['id']
        self.threshold = checkpoint['settings']['confidence_threshold']

    def predict(self, request, timings=None):
        started = perf_counter()
        x, lengths, coverage, normalized = prepare(request.landmarks, request.point_mask,
                                                  request.timestamps_ms, request.width, request.height)
        if timings is not None:
            timings['preprocess'] = (perf_counter() - started) * 1000
        base = dict(experimental=True, modelo=self.identifier, desconocidas_validadas=False)
        if coverage < .5 or normalized < .5:
            return dict(base, estado='captura_insuficiente', glosa=None, confidence=None,
                        probabilidades=[], mensaje='No se detectaron manos utilizables en suficiente parte de la captura.')
        started = perf_counter()
        with torch.inference_mode():
            probabilities = torch.softmax(self.model(x, lengths), dim=1)[0].numpy()
        if timings is not None:
            timings['inference'] = (perf_counter() - started) * 1000
        index = int(probabilities.argmax())
        confidence = float(probabilities[index])
        accepted = confidence >= self.threshold
        return dict(base, estado='resultado_experimental' if accepted else 'no_concluyente',
                    glosa=self.classes[index] if accepted else None, confidence=confidence,
                    probabilidades=probabilities.tolist(),
                    mensaje='Hipótesis experimental; puede ser incorrecta.' if accepted else 'Resultado no concluyente. Intenta una sola seña del vocabulario.')
