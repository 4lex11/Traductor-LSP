from pathlib import Path
from urllib.parse import quote
import os
from fastapi import HTTPException
from fastapi.staticfiles import StaticFiles
try:
    from .service import app
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from Backend.service import app
VIDEOS_DIR = Path(os.environ.get('LSP_CATALOG_DIR', str(Path(__file__).resolve().parent / 'catalog')))
if VIDEOS_DIR.is_dir():
    app.mount('/videos', StaticFiles(directory=str(VIDEOS_DIR)), name='videos')

def construir_video(carpeta, archivo):
    ruta = (
        "/videos/"
        + quote(carpeta.name, safe="")
        + "/"
        + quote(archivo.name, safe="")
    )

    return {
        "nombre": archivo.name,
        "url": ruta
    }


@app.get("/api/senas")
def listar_senas():
    resultado = []
    if not VIDEOS_DIR.is_dir():
        return []
    for carpeta in sorted(VIDEOS_DIR.iterdir()):
        if not carpeta.is_dir():
            continue
        videos = sorted(carpeta.glob("*.mp4"))
        if videos:
            resultado.append({
                "nombre": carpeta.name,
                "cantidad_videos": len(videos)
            })
    return resultado


@app.get("/api/senas/{palabra}")
def buscar_sena(palabra: str):
    if not VIDEOS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Catálogo no configurado")
    carpetas = {
        carpeta.name.casefold(): carpeta
        for carpeta in VIDEOS_DIR.iterdir()
        if carpeta.is_dir()
    }
    carpeta = carpetas.get(palabra.strip().casefold())
    if carpeta is None:
        raise HTTPException(status_code=404, detail="La seña no está en el catálogo")
    videos = [
        archivo
        for archivo in sorted(carpeta.glob("*.mp4"))
        if "ORACION" not in archivo.stem.upper()
    ]
    if not videos:
        raise HTTPException(status_code=404, detail="No hay videos de seña aislada")
    return {
        "palabra": carpeta.name,
        "videos": [
            construir_video(carpeta, video)
            for video in videos
        ],
        "total": len(videos)
    }


