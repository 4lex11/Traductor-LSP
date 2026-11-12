"""Referencia Videos1: permite un frame real; no prueba reconocimiento temporal."""
import numpy as np

PARENTS=np.array([0,1,2,3,0,5,6,7,0,9,10,11,0,13,14,15,0,17,18,19])
CHILDREN=np.arange(1,21)


def describe(raw, mask, times, width, height):
    raw=np.asarray(raw,np.float32).reshape(-1,42,3).copy()
    mask=np.asarray(mask,bool)
    times=np.asarray(times,np.float64)
    if len(raw)<1 or mask.shape!=raw.shape[:2] or len(times)!=len(raw) or width<=0 or height<=0:
        raise ValueError('Formato inválido')
    if not np.isfinite(raw).all() or not np.isfinite(times).all() or (np.diff(times)<=0).any():
        raise ValueError('Secuencia inválida')
    raw[:,:,1]*=height/width
    values=[]; validity=[]; scales=[]
    for start in (0,21):
        points=raw[:,start:start+21]; present=mask[:,start:start+21]
        bones=points[:,CHILDREN]-points[:,PARENTS]
        norm=np.linalg.norm(bones,axis=2)
        valid=present[:,CHILDREN]&present[:,PARENTS]&(norm>1e-6)
        unit=np.divide(bones,norm[:,:,None],out=np.zeros_like(bones),where=norm[:,:,None]>1e-6)
        values.append(unit.reshape(len(raw),60));validity.append(np.repeat(valid,3,axis=1))
        adjacent=[(finger*4+j,finger*4+j+1) for finger in range(5) for j in range(3)]
        angles=np.stack([(unit[:,a]*unit[:,b]).sum(axis=1) for a,b in adjacent],axis=1)
        angles_mask=np.stack([valid[:,a]&valid[:,b] for a,b in adjacent],axis=1)
        values.append(angles);validity.append(angles_mask)
        palm=np.linalg.norm(points[:,9,:2]-points[:,0,:2],axis=1)
        good=present[:,0]&present[:,9]&(palm>1e-6)
        if good.any():scales.extend(palm[good].tolist())
    scale=float(np.median(scales)) if scales else 1.
    both=mask[:,0]&mask[:,21]
    values.append(np.clip((raw[:,21]-raw[:,0])/scale,-20,20));validity.append(np.repeat(both[:,None],3,axis=1))
    for wrist in (0,21):
        velocity=np.zeros((len(raw),3),np.float32)
        velocity[1:]=np.diff(raw[:,wrist],axis=0)/scale/np.diff(times)[:,None]*1000
        valid=np.r_[False,mask[1:,wrist]&mask[:-1,wrist]]
        values.append(np.clip(velocity,-20,20));validity.append(np.repeat(valid[:,None],3,axis=1))
    values=np.concatenate(values,axis=1);validity=np.concatenate(validity,axis=1)
    statistics=[]
    # Cada estadística usa solo observaciones válidas, sin rellenar puntos ausentes.
    for dimension in range(values.shape[1]):
        observed=values[validity[:,dimension],dimension]
        if len(observed):
            first=values[:max(1,len(raw)//3),dimension][validity[:max(1,len(raw)//3),dimension]]
            last=values[-max(1,len(raw)//3):,dimension][validity[-max(1,len(raw)//3):,dimension]]
            a=float(first.mean()) if len(first) else 0.
            b=float(last.mean()) if len(last) else 0.
            statistics.extend([observed.mean(),observed.std(),*np.percentile(observed,[10,90]),a,b,b-a])
        else:statistics.extend([0.]*7)
    statistics.extend([mask[:,:21].any(axis=1).mean(),mask[:,21:].any(axis=1).mean(),(times[-1]-times[0])/1000])
    result=np.asarray(statistics,np.float32)
    assert result.shape==(1116,) and np.isfinite(result).all()
    return result
