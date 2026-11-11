# Reconocedor experimental de señas aisladas LSP

Prototipo universitario de vocabulario cerrado (17 clases). No traduce conversaciones. El modelo demo obtuvo 18,9 % de exactitud en un fold exploratorio: no es fiable para uso real ni sustituye a un intérprete.

## Despliegue

- Vercel Hobby: raíz `interfaz-traductor-lsp`, `npm ci`, `npm run build`, Node 24.
- Variables frontend: `NEXT_PUBLIC_LSP_API_URL` = URL HTTPS de Render; `NEXT_PUBLIC_LSP_CATALOG=static`.
- Render Free: raíz del repositorio, `render.yaml`, un worker CPU. Definir `LSP_CORS_ORIGINS` con el dominio HTTPS exacto del frontend. No activar bases de datos, discos persistentes ni planes pagos.
- `/healthz` comprueba vida del proceso y `/readyz` disponibilidad del checkpoint. El repositorio contiene pesos y sus hashes; no depende de datasets ni de archivos cargados en ejecución.
- Conservar `ML/train_sprint4.py` y `ML/preprocessing_lsp.py`: la API reutiliza sus funciones. No ejecutar entrenamiento durante el build.
- El navegador ejecuta Holistic WASM local y envía puntos, máscaras y tiempos, nunca el video de cámara.
- Para recuperar una versión, volver a desplegar el commit anterior conservando sus pesos/metadatos juntos.

## Recursos y atribución

Catálogo visual independiente del modelo: 824 entradas (95,4 % de las 864 etiquetas no vacías ELAN/JSON, comparadas por texto normalizado), con 475 referencias Full HD. Incluye segmentos PUCP 305 (CC BY-NC 4.0, uso no comercial) y AEC (CC0 1.0). Se prioriza la resolución real, sin ampliación artificial. Fuentes, autores, licencias y cambios: `public/catalog/ATRIBUCION.txt` y cada video en `public/catalog/index.json`. Las etiquetas no tienen validación lingüística adicional. Las coincidencias escritas entre fuentes no prueban equivalencia. El reconocedor conserva sus 17 clases.

MediaPipe Tasks Vision 1.2.0 y Holistic se usan con sus licencias respectivas; https://github.com/google-ai-edge/mediapipe. El CSS de variantes de shadcn conserva su licencia MIT dentro de `app/shadcn-variants.css`.

Este repositorio contiene el paquete mínimo de publicación. Los videos completos y resultados de investigación permanecen fuera del hosting. El despliegue no demuestra precisión ni valida personas nuevas.
