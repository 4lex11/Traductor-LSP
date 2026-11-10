"""Comparación exploratoria AEC: manos y Holistic, dos folds, sin ajustar al holdout."""
import hashlib
import json
from pathlib import Path
import random
import time

import numpy as np
import torch
from torch import nn
from torch.nn.utils.rnn import pack_padded_sequence
from torch.utils.data import DataLoader, TensorDataset

ML = Path(__file__).resolve().parent
DATA = ML / 'processed/sprint_3'
OUT = ML / 'processed/sprint_4'
SETTINGS = dict(seed=42, epochs=40, batch_size=32, learning_rate=.001,
                weight_decay=.0001, projection=64, hidden=32, dropout=.2,
                gradient_clip=1., confidence_threshold=.65, cpu_threads=4)


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def inputs(data, representation):
    """Coordenadas, máscara de puntos y delta temporal en segundos."""
    key, mask_key = ('hands', 'hands_mask') if representation == 'hands' else ('x', 'point_mask')
    values = data[key].copy()
    mask = data[mask_key] & data['frame_mask'][:, :, None]
    values *= np.repeat(mask, 3, axis=2)
    dt = np.zeros_like(data['times_ms'], dtype=np.float32)
    dt[:, 1:] = np.diff(data['times_ms'], axis=1) / 1000
    dt[~data['frame_mask']] = 0
    if (dt < 0).any():
        raise ValueError('Tiempos no monótonos')
    result = np.concatenate([values, mask.astype(np.float32), dt[:, :, None]], axis=2)
    if not np.isfinite(result).all():
        raise ValueError('Entrada no finita')
    return torch.from_numpy(result), torch.from_numpy(data['lengths']).long(), torch.from_numpy(data['y']).long()


class SequenceClassifier(nn.Module):
    def __init__(self, input_size, classes):
        super().__init__()
        self.projection = nn.Sequential(nn.Linear(input_size, SETTINGS['projection']), nn.ReLU())
        self.lstm = nn.LSTM(SETTINGS['projection'], SETTINGS['hidden'], batch_first=True, bidirectional=True)
        self.dropout = nn.Dropout(SETTINGS['dropout'])
        self.classifier = nn.Linear(SETTINGS['hidden'] * 2, classes)

    def forward(self, x, lengths):
        projected = self.projection(x)
        packed = pack_padded_sequence(projected, lengths.cpu(), batch_first=True, enforce_sorted=False)
        _, (hidden, _) = self.lstm(packed)
        return self.classifier(self.dropout(torch.cat([hidden[-2], hidden[-1]], dim=1)))


def metrics(y, probabilities, classes):
    predicted = probabilities.argmax(axis=1)
    confusion = np.zeros((classes, classes), dtype=np.int64)
    np.add.at(confusion, (y, predicted), 1)
    tp = confusion.diagonal()
    support, emitted = confusion.sum(axis=1), confusion.sum(axis=0)
    precision = np.divide(tp, emitted, out=np.zeros(classes, dtype=float), where=emitted > 0)
    recall = np.divide(tp, support, out=np.zeros(classes, dtype=float), where=support > 0)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros(classes, dtype=float), where=(precision + recall) > 0)
    accepted = probabilities.max(axis=1) >= SETTINGS['confidence_threshold']
    return dict(n=len(y), accuracy=float((predicted == y).mean()), macro_f1=float(f1.mean()),
                confusion=confusion.tolist(),
                per_class=[dict(label=i, support=int(support[i]), precision=float(precision[i]), recall=float(recall[i]), f1=float(f1[i])) for i in range(classes)],
                fixed_threshold=dict(threshold=SETTINGS['confidence_threshold'], accepted=int(accepted.sum()),
                                     coverage=float(accepted.mean()),
                                     accuracy_accepted=float((predicted[accepted] == y[accepted]).mean()) if accepted.any() else None,
                                     unknown_rejection_validated=False))


def load_batch(path):
    with np.load(path, allow_pickle=False) as archive:
        return {k: archive[k] for k in archive.files}


def train_one(fold, representation, classes, config_hash):
    seed = SETTINGS['seed'] + fold
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    folder = OUT / f'fold_{fold}_{representation}'
    folder.mkdir(exist_ok=True)
    train_path = DATA / f'fold_{fold}/train.npz'
    train_data = load_batch(train_path)
    x, lengths, y = inputs(train_data, representation)
    model = SequenceClassifier(x.shape[-1], classes)
    counts = torch.bincount(y, minlength=classes).float()
    if (counts == 0).any():
        raise ValueError('Falta una clase en entrenamiento')
    loss_function = nn.CrossEntropyLoss(weight=len(y) / (classes * counts))
    optimizer = torch.optim.AdamW(model.parameters(), lr=SETTINGS['learning_rate'], weight_decay=SETTINGS['weight_decay'])
    loader = DataLoader(TensorDataset(x, lengths, y), batch_size=SETTINGS['batch_size'], shuffle=True,
                        generator=torch.Generator().manual_seed(seed), num_workers=0)
    history = []
    start = time.monotonic()
    print(f'Inicio fold={fold} representación={representation} muestras={len(y)}', flush=True)
    for epoch in range(1, SETTINGS['epochs'] + 1):
        model.train()
        total_loss = 0.
        correct = 0
        for bx, bl, by in loader:
            optimizer.zero_grad()
            logits = model(bx, bl)
            loss = loss_function(logits, by)
            if not torch.isfinite(loss):
                raise ValueError('Pérdida no finita')
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), SETTINGS['gradient_clip'])
            optimizer.step()
            total_loss += float(loss.detach()) * len(by)
            correct += int((logits.argmax(1) == by).sum())
        history.append(dict(epoch=epoch, train_loss_weighted_batch_average=total_loss / len(y), train_accuracy=correct / len(y)))
        if epoch % 10 == 0:
            print(f'fold={fold} {representation} época={epoch}/40 loss={total_loss / len(y):.4f}', flush=True)
    # Se guarda la última época fija ANTES de abrir los datos de evaluación.
    checkpoint = dict(state_dict=model.state_dict(), input_size=x.shape[-1], classes=classes,
                      representation=representation, settings=SETTINGS, config_hash=config_hash,
                      fold=fold, seed=seed, epoch=SETTINGS['epochs'], label_map=read(DATA / 'label_map_AEC.json'),
                      input_contract='sprint3_normalized_coords_point_mask_delta_seconds_v1',
                      stage2_config=read(ML / 'processed/sprint_2/config.json'),
                      stage3_config=read(DATA / 'config.json'),
                      approved_for_deployment=False)
    torch.save(checkpoint, folder / 'model.pt')
    save(folder / 'history.json', history)
    # Evaluación única; no realimenta épocas, pesos ni hiperparámetros.
    holdout_path = DATA / f'fold_{fold}/holdout.npz'
    held = load_batch(holdout_path)
    hx, hl, hy = inputs(held, representation)
    model.eval()
    with torch.inference_mode():
        probabilities = torch.softmax(model(hx, hl), dim=1).numpy()
    result = metrics(hy.numpy(), probabilities, classes)
    # Referencia mayoritaria calculada exclusivamente en train.
    majority = int(counts.argmax())
    baseline = np.zeros_like(probabilities)
    baseline[:, majority] = 1
    result.update(fold=fold, representation=representation, seed=seed,
                  parameter_count=sum(p.numel() for p in model.parameters()),
                  seconds=round(time.monotonic() - start, 3),
                  majority_train_baseline=metrics(hy.numpy(), baseline, classes),
                  senante_reservado=read(DATA / f'fold_{fold}/holdout_miembros.json')[0]['senante_id'])
    members = read(DATA / f'fold_{fold}/holdout_miembros.json')
    predictions = [dict(id=m['parent_id'], senante_id=m['senante_id'], y_true=int(hy[i]),
                        y_pred=int(probabilities[i].argmax()), probabilities=probabilities[i].tolist()) for i, m in enumerate(members)]
    save(folder / 'predictions.json', predictions)
    save(folder / 'metrics.json', result)
    print(f'Final fold={fold} {representation}: accuracy={result["accuracy"]:.3f} macro-F1={result["macro_f1"]:.3f}', flush=True)
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if read(DATA / 'verificacion.json')['estado'] != 'verificado':
        raise ValueError('Sprint 3 no verificado')
    for relative, expected in read(DATA / 'artefactos_sha256.json').items():
        if sha(DATA / relative) != expected:
            raise ValueError(f'Artefacto cambiado: {relative}')
    sources = {p.relative_to(DATA).as_posix(): sha(p) for p in DATA.rglob('*') if p.is_file() and p.suffix in ('.npz', '.json', '.jsonl')}
    config = dict(version='sprint4-v1', settings=SETTINGS, torch=str(torch.__version__), numpy=np.__version__,
                  codigo_sha256=sha(Path(__file__)), source_hashes=sources,
                  selection_rule='fixed_final_epoch_no_holdout_tuning',
                  scope='AEC_experimental_source_labels_not_linguistically_validated', device='cpu')
    config_hash = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    config['config_hash'] = config_hash
    if (OUT / 'config.json').exists() and read(OUT / 'config.json') != config:
        raise ValueError('Configuración diferente: crear una salida versionada nueva')
    if (OUT / 'resumen.json').exists():
        raise ValueError('Experimento ya terminado; conservar resultados, no reentrenar silenciosamente')
    save(OUT / 'config.json', config)
    torch.set_num_threads(SETTINGS['cpu_threads'])
    torch.use_deterministic_algorithms(True)
    classes = len(read(DATA / 'label_map_AEC.json')['label_to_idx'])
    results = [train_one(fold, representation, classes, config_hash)
               for representation in ('hands', 'holistic') for fold in (1, 2)]
    combined = {}
    for representation in ('hands', 'holistic'):
        predictions = [p for fold in (1, 2) for p in read(OUT / f'fold_{fold}_{representation}/predictions.json')]
        assert len({p['id'] for p in predictions}) == len(predictions)
        combined[representation] = metrics(np.array([p['y_true'] for p in predictions]),
                                           np.array([p['probabilities'] for p in predictions]), classes)
    save(OUT / 'resumen.json', dict(estado='entrenamiento_exploratorio_completado', runs=results,
                                   predicciones_fuera_de_fold=combined,
                                   production_model_selected=False, unknown_rejection_validated=False,
                                   independent_validation_available=False))
    for relative, expected in sources.items():
        assert sha(DATA / relative) == expected, relative
    save(OUT / 'artefactos_sha256.json', {p.relative_to(OUT).as_posix(): sha(p) for p in OUT.rglob('*')
                                         if p.is_file() and p.suffix in ('.pt', '.json') and p.name != 'artefactos_sha256.json'})


if __name__ == '__main__':
    main()
