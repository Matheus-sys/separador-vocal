"""Referencia em numpy do pipeline MDX-Net (igual ao UVR) + medida de SDR.
Uso: python -I mdx_ref.py <modelo.onnx> <n_fft> <dim_f> <compensate> <mix.wav> [voc.wav] [saida.wav]
"""
import sys, time, wave
import numpy as np
import onnxruntime as ort

HOP = 1024
DIM_T = 256


def ler_wav(p):
    with wave.open(p, 'rb') as w:
        n = w.getnframes(); ch = w.getnchannels()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    return a.reshape(-1, ch).T  # (2, N)


def gravar_wav(p, x):
    x = np.clip(x.T, -1, 1)
    with wave.open(p, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def stft(x, n_fft):
    # x: (C, chunk). Igual a torch.stft(center=True, pad reflect, hann periodica)
    win = np.hanning(n_fft + 1)[:-1].astype(np.float32)
    pad = n_fft // 2
    xp = np.pad(x, ((0, 0), (pad, pad)), mode='reflect')
    nfr = 1 + (xp.shape[1] - n_fft) // HOP
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(nfr)[:, None]
    fr = xp[:, idx] * win  # (C, T, n_fft)
    return np.fft.rfft(fr, axis=-1).transpose(0, 2, 1)  # (C, bins, T)


def istft(S, n_fft, length):
    win = np.hanning(n_fft + 1)[:-1].astype(np.float32)
    fr = np.fft.irfft(S.transpose(0, 2, 1), n=n_fft, axis=-1) * win  # (C,T,n_fft)
    C, T, _ = fr.shape
    out = np.zeros((C, n_fft + HOP * (T - 1)), np.float32)
    wsum = np.zeros(n_fft + HOP * (T - 1), np.float32)
    for t in range(T):
        out[:, t * HOP:t * HOP + n_fft] += fr[:, t]
        wsum[t * HOP:t * HOP + n_fft] += win ** 2
    out /= np.maximum(wsum, 1e-8)
    pad = n_fft // 2
    return out[:, pad:pad + length]


def separar(sess, mix, n_fft, dim_f, comp):
    chunk = HOP * (DIM_T - 1)
    trim = n_fft // 2
    gen = chunk - 2 * trim
    N = mix.shape[1]
    pad = gen - N % gen
    m = np.concatenate([np.zeros((2, trim)), mix, np.zeros((2, pad)), np.zeros((2, trim))], 1).astype(np.float32)
    outs = []
    for i in range(0, N + pad, gen):
        seg = m[:, i:i + chunk]
        S = stft(seg, n_fft)[:, :dim_f]  # (2, dim_f, 256)
        inp = np.stack([S[0].real, S[0].imag, S[1].real, S[1].imag])[None].astype(np.float32)
        o = sess.run(None, {'input': inp})[0][0]
        bins = n_fft // 2 + 1
        Sc = np.zeros((2, bins, DIM_T), np.complex64)
        Sc[0, :dim_f] = o[0] + 1j * o[1]
        Sc[1, :dim_f] = o[2] + 1j * o[3]
        y = istft(Sc, n_fft, chunk)
        outs.append(y[:, trim:-trim])
    return np.concatenate(outs, 1)[:, :N] * comp


def sdr(ref, est):
    num = np.sum(ref ** 2); den = np.sum((ref - est) ** 2)
    return 10 * np.log10(num / max(den, 1e-10) + 1e-10)


if __name__ == '__main__':
    mod, n_fft, dim_f, comp, mixp = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
    sess = ort.InferenceSession(mod, providers=['CPUExecutionProvider'])
    mix = ler_wav(mixp)
    t = time.time(); est = separar(sess, mix, n_fft, dim_f, comp); dt = time.time() - t
    print(f'tempo {dt:.1f}s para {mix.shape[1]/44100:.1f}s de audio')
    if len(sys.argv) > 6 and sys.argv[6] != '-':
        voc = ler_wav(sys.argv[6])
        n = min(voc.shape[1], est.shape[1])
        print(f'SDR voz {sdr(voc[:, :n], est[:, :n]):.2f} dB | SDR instrumental {sdr(mix[:, :n]-voc[:, :n], mix[:, :n]-est[:, :n]):.2f} dB')
    if len(sys.argv) > 7:
        gravar_wav(sys.argv[7], est)
