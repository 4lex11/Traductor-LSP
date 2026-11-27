"""API experimental independiente de los datasets originales."""
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal
import unicodedata
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, model_validator
import torch
from .inference import CONTRACT, EXTRACTOR_SHA, EXTRACTOR_RUNTIME, Recognizer

BASE_DIR = Path(__file__).resolve().parent
CATALOG_INDEX = BASE_DIR.parent / 'interfaz-traductor-lsp/public/catalog/index.json'
lock = Lock()

def catalog_glosses(reference):
    def key(word):
        return unicodedata.normalize('NFC', word.strip()).casefold()

    entries = json.loads(CATALOG_INDEX.read_text(encoding='utf-8'))
    names = {key(entry['palabra']): entry['palabra'] for entry in entries}
    return {item['gloss']: names[key(item['gloss'])] for item in reference.classes
            if item['usable_references'] and key(item['gloss']) in names}

@asynccontextmanager
async def lifespan(app):
    app.state.recognizer = None
    app.state.reference_model = None
    app.state.catalog_glosses = {}
    torch.set_num_threads(1)
    try:
        app.state.recognizer = Recognizer(
            Path(os.environ.get('LSP_MODEL_PATH', str(BASE_DIR / 'assets/model.pt'))),
            mirror_single_hand_enabled=os.environ.get('LSP_MIRROR_SINGLE_HAND') == '1',
        )
    except Exception:
        logging.exception('No se pudo cargar el modelo experimental')
    reference_dir = Path(os.environ.get('LSP_REFERENCE_MODEL_DIR', str(BASE_DIR / 'assets/videos1_reference')))
    if (reference_dir / 'model_status.json').is_file():
        try:
            from videos1_reference_model import Videos1ReferenceModel
            app.state.reference_model = Videos1ReferenceModel(reference_dir)
        except Exception:
            logging.exception('No se pudo cargar el banco de referencias Videos1')
    if app.state.reference_model is not None and CATALOG_INDEX.is_file():
        try:
            app.state.catalog_glosses = catalog_glosses(app.state.reference_model)
        except (OSError, ValueError, KeyError, TypeError):
            logging.exception('No se pudo vincular el diccionario con el banco de referencias')
    yield
    app.state.recognizer = None
    app.state.reference_model = None

app = FastAPI(title='LSP: reconocimiento experimental', lifespan=lifespan)

@app.exception_handler(RequestValidationError)
async def invalid_request(request, error):
    # No devolver valores de entrada: NaN/Infinity tampoco son JSON de respuesta válidos.
    return JSONResponse({'detail': 'Captura inválida: revisa formato, máscaras y tiempos.',
                         'errors': [{'loc': list(e['loc']), 'msg': e['msg']} for e in error.errors()]}, status_code=422)

class BodyLimit:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['path'] not in ('/api/predict', '/api/predict-reference'):
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > 1024 * 1024:
                return await JSONResponse({'detail': 'La captura supera 1 MiB'}, status_code=413)(scope, receive, send)
            if not message.get('more_body', False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
        await self.app(scope, replay, send)

app.add_middleware(BodyLimit)
app.add_middleware(CORSMiddleware,
    allow_origins=[v.strip() for v in os.environ.get('LSP_CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if v.strip()],
    allow_methods=['GET', 'POST'], allow_headers=['Content-Type'], expose_headers=['Server-Timing'])

Coordinate = Annotated[FiniteFloat, Field(ge=-10, le=10)]
Frame = Annotated[list[Coordinate], Field(min_length=126, max_length=126)]
Mask = Annotated[list[StrictBool], Field(min_length=42, max_length=42)]

class LandmarksRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    contract: Literal['holistic-hands-raw-v1']
    extractor_runtime: Literal['holistic-wasm-1.2.0-cpu-v1']
    extractor_sha256: Literal['e2dab61191e2dcd0a15f943d8e3ed1dce13c82dfa597b9dd39f562975a50c3f8']
    landmarks: Annotated[list[Frame], Field(min_length=3, max_length=90)]
    point_mask: Annotated[list[Mask], Field(min_length=3, max_length=90)]
    timestamps_ms: Annotated[list[Annotated[FiniteFloat, Field(ge=0, le=10000)]], Field(min_length=3, max_length=90)]
    width: Annotated[int, Field(strict=True, ge=1, le=4096)]
    height: Annotated[int, Field(strict=True, ge=1, le=4096)]

    @model_validator(mode='after')
    def consistent(self):
        if len(self.landmarks) != len(self.point_mask) or len(self.landmarks) != len(self.timestamps_ms):
            raise ValueError('Longitudes de captura diferentes')
        if any(b <= a for a, b in zip(self.timestamps_ms, self.timestamps_ms[1:])):
            raise ValueError('Los tiempos deben ser crecientes')
        for frame, mask in zip(self.landmarks, self.point_mask):
            if any(not present and any(frame[i*3:i*3+3]) for i, present in enumerate(mask)):
                raise ValueError('Los puntos ausentes deben tener coordenadas cero')
        return self

@app.get('/healthz')
def health():
    return {'status': 'alive'}

def state():
    model = getattr(app.state, 'recognizer', None)
    reference = getattr(app.state, 'reference_model', None)
    return dict(ready=model is not None, experimental=True, extractor_parity_validated=model.parity_validated if model else False, extractor_runtime=EXTRACTOR_RUNTIME, contract=CONTRACT, extractor_sha256=EXTRACTOR_SHA,
                prueba_ahora_disponible=model is not None and reference is not None and ahora_retry_enabled(),
                modelo=model.identifier if model else None, clases=model.classes if model else [],
                referencias_disponibles=reference is not None,
                clases_diccionario_comparables=len(set(getattr(app.state, 'catalog_glosses', {}).values())),
                clases_referencia=[c['gloss'] for c in reference.classes if c['usable_references'] > 0] if reference else [],
                mensaje='Prototipo experimental de baja precisión.' if model else 'Modelo no disponible.')

@app.get('/readyz')
def ready():
    info = state()
    return JSONResponse(info, status_code=200 if info['ready'] else 503)

@app.get('/')
@app.get('/api/modelo/estado')
def status():
    return state()

@app.get('/api/modelo/clases')
def classes():
    info = state()
    if not info['ready']:
        raise HTTPException(503, 'Modelo no disponible')
    return {'clases': info['clases'], 'total': len(info['clases']), 'experimental': True}


def ahora_retry_enabled():
    return os.environ.get('LSP_AHORA_RETRY') == '1' or os.environ.get('LSP_AHORA_RETRY_LOCAL') == '1'


@app.post('/api/predict')
def predict(request: LandmarksRequest, response: Response, prueba_ahora: bool = False):
    model = getattr(app.state, 'recognizer', None)
    if model is None:
        raise HTTPException(503, 'Modelo no disponible.')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'Servidor ocupado. Intenta nuevamente.', headers={'Retry-After': '2'})
    try:
        timings = {}
        result = model.predict(request, timings)
        if prueba_ahora and ahora_retry_enabled():
            reference = getattr(app.state, 'reference_model', None)
            if reference is not None:
                try:
                    result = retry_ahora(model, reference, request, result)
                except (RuntimeError, ValueError):
                    logging.exception('Falló la prueba local de AHORA')
        # Duraciones internas; no incluyen red, validación HTTP ni espera de arranque.
        response.headers['Server-Timing'] = ', '.join(f'{name};dur={duration:.3f}' for name, duration in timings.items())
        return result
    finally:
        lock.release()


def retry_ahora(model, bank, request: LandmarksRequest, original):
    if original['estado'] != 'no_concluyente':
        return original
    scores = original['probabilidades']
    if not scores or model.classes[scores.index(max(scores))] != 'ahora':
        return original
    visible = [i for i, frame in enumerate(request.point_mask) if any(frame)]
    if not visible:
        return original
    first, last = visible[0], visible[-1]
    if (first == 0 and last == len(request.point_mask) - 1) or last - first < 5:
        return original
    if request.timestamps_ms[last] - request.timestamps_ms[first] < 500:
        return original
    span = slice(first, last + 1)
    cropped = request.model_copy(update={
        'landmarks': request.landmarks[span],
        'point_mask': request.point_mask[span],
        'timestamps_ms': request.timestamps_ms[span],
    })
    candidate = model.predict(cropped)
    if candidate['estado'] != 'resultado_experimental' or candidate['glosa'] != 'ahora':
        return original
    matches = bank.predict(cropped.landmarks, cropped.point_mask, cropped.timestamps_ms,
                           cropped.width, cropped.height)
    if any(item['glosa'].casefold() == 'ahora' for item in matches['candidatos']):
        return candidate
    return original


@app.post('/api/predict-reference')
def predict_reference(request: LandmarksRequest, catalogo: bool = False):
    model = getattr(app.state, 'reference_model', None)
    if model is None:
        raise HTTPException(503, 'Las referencias de Videos1 todavía no están disponibles.')
    catalog = getattr(app.state, 'catalog_glosses', {}) if catalogo else None
    if catalogo and not catalog:
        raise HTTPException(503, 'El diccionario no está disponible para comparar señas.')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'Servidor ocupado. Intenta nuevamente.', headers={'Retry-After': '2'})
    try:
        filters = {'allowed_glosses': catalog} if catalogo else {}
        result = model.predict(request.landmarks, request.point_mask, request.timestamps_ms,
                               request.width, request.height, **filters)
        insufficient = result['estado'] == 'captura_insuficiente'
        candidates = result['candidatos']
        if catalog is not None:
            candidates = [{**candidate, 'glosa': catalog[candidate['glosa']]} for candidate in candidates]
        return dict(estado='captura_insuficiente' if insufficient else 'no_concluyente', glosa=None, confidence=None,
                    experimental=True, referencias=candidates,
                    mensaje='No se detectaron manos suficientes.' if insufficient else result['mensaje'])
    finally:
        lock.release()
