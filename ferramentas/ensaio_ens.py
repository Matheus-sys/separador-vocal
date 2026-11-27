import sys, gc, numpy as np, onnxruntime as ort
sys.path.insert(0, 'ferramentas')
from mdx_ref import ler_wav, separar, sdr
mixes = [ler_wav(f'_teste/t{i}_mix.wav') for i in range(1, 5)]
vocs = [ler_wav(f'_teste/t{i}_voc.wav') for i in range(1, 5)]
res = {}
for nome, arq, nf, df, c, prim_voz in [('kim', 'Kim_Vocal_2', 7680, 3072, 1.009, True), ('hq3', 'UVR-MDX-NET-Inst_HQ_3', 6144, 3072, 1.022, False)]:
    s = ort.InferenceSession(f'_modelos/{arq}.onnx', providers=['CPUExecutionProvider'])
    res[nome] = [separar(s, m, nf, df, c) if prim_voz else m - separar(s, m, nf, df, c) for m in mixes]
    del s; gc.collect()
for i in range(4):
    n = min(mixes[i].shape[1], vocs[i].shape[1]); v = vocs[i][:, :n]
    a, b = res['kim'][i][:, :n], res['hq3'][i][:, :n]
    print(i + 1, 'kim %.2f hq3 %.2f ens %.2f' % (sdr(v, a), sdr(v, b), sdr(v, (a + b) / 2)))
