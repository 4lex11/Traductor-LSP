"""Consulta del banco de Videos1. Distancias no equivalen a confianza."""
import json
from pathlib import Path
import numpy as np
from geometry_videos1_reference import describe


class Videos1ReferenceModel:
    def __init__(self, directory):
        directory=Path(directory)
        status=json.loads((directory/'model_status.json').read_text())
        from hashlib import sha256
        path=directory/'reference_model.npz'
        if sha256(path.read_bytes()).hexdigest()!=status['reference_sha256']:
            raise ValueError('Modelo alterado')
        with np.load(path,allow_pickle=False) as d:
            self.data={k:d[k].copy() for k in d.files}
        self.classes=json.loads((directory/'label_map.json').read_text(encoding='utf-8'))

    def predict(self, raw, mask, times, width, height, count=5):
        mask=np.asarray(mask,bool)
        if not len(mask) or mask.any(axis=1).mean()<.5:
            return dict(estado='captura_insuficiente',candidatos=[],precision_validada=False)
        query=describe(raw,mask,times,width,height)
        query=(query-self.data['mean'])/self.data['scale']
        distances=np.mean(np.minimum((self.data['references']-query)**2,25),axis=1)
        seen=set();candidates=[]
        for i in np.argsort(distances,kind='stable'):
            label=int(self.data['labels'][i])
            if label in seen:continue
            seen.add(label)
            candidates.append(dict(glosa=self.classes[label]['gloss'],distancia=float(distances[i]),
                                   ejemplo_id=str(self.data['ids'][i])))
            if len(candidates)>=count:break
        return dict(estado='referencias_experimentales',candidatos=candidates,precision_validada=False,
                    mensaje='Similitud con referencias; no confirma que la seña sea correcta ni rechaza señas desconocidas.')
