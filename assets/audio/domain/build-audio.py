"""Original, deterministic multilayer SFX. Does not modify runtime AudioService."""
from __future__ import annotations

import hashlib
import json
import math
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
HERE.mkdir(parents=True, exist_ok=True)
SR = 48_000
SEED = 20261101


def clock(duration):
    return np.arange(round(duration * SR), dtype=float) / SR


def envelope(t, attack=.004, decay=.13, release=.025):
    return np.minimum(1, t / attack) * np.exp(-t / decay) * np.minimum(1, (t[-1] - t) / release)


def sweep(t, start, end, harmonics=0.0):
    f = start * np.exp(np.log(end / start) * t / max(1 / SR, t[-1]))
    phase = np.cumsum(f) * 2 * np.pi / SR
    return np.sin(phase) + harmonics * .32 * np.sin(phase * 2.013) + harmonics * .14 * np.sin(phase * 3.021)


def noise(t, low, high, rng):
    raw = rng.standard_normal(len(t))
    sos = butter(3, [low, high], btype='bandpass', fs=SR, output='sos')
    out = sosfilt(sos, raw)
    return out / max(1e-9, np.std(out))


def metal(t, fundamental, decay=.15):
    out = np.zeros_like(t)
    for i, ratio in enumerate((1, 1.4142, 2.756, 4.071)):
        out += np.sin(2 * np.pi * fundamental * ratio * t) * np.exp(-t / (decay / (1 + i * .35))) / (1 + i * 1.5)
    return out * np.minimum(1, t / .003)


def periodic_noise(t, rng):
    frequencies = np.fft.rfftfreq(len(t), 1 / SR)
    amplitudes = np.exp(-((frequencies - 680) / 560) ** 2) * (frequencies > 90)
    spectrum = amplitudes * np.exp(1j * rng.uniform(0, 2 * np.pi, len(frequencies)))
    out = np.fft.irfft(spectrum, n=len(t))
    return out / max(1e-9, np.std(out))


def synth(kind, duration, seed, pitch=1.0):
    rng = np.random.default_rng(seed)
    t = clock(duration)
    end = max(.001, t[-1])
    u = t / end
    loop = kind in ('vortex', 'remnant')
    if kind == 'deploy':
        x = .26 * noise(t, 180, 1900, rng) * np.sin(np.pi * u) ** 1.5
        x += .38 * sweep(t, 360*pitch, 125*pitch, .8) * envelope(t, .014, .10)
        x += .24 * metal(t, 730*pitch, .11) * np.sin(np.pi * u) ** .6
    elif kind == 'link':
        x = .55 * metal(t, 590*pitch, .07) + .10 * noise(t, 1100, 4400, rng) * envelope(t, .002, .025)
    elif kind == 'closure':
        x = .36 * metal(t, 370*pitch, .12) + .45 * sweep(t, 185, 68, .5) * envelope(t, .003, .12)
        x += .16 * noise(t, 250, 1700, rng) * envelope(t, .004, .07)
    elif kind == 'collapse':
        x = .35 * noise(t, 95, 3100, rng) * u ** 1.25
        x += .34 * sweep(t, 110*pitch, 690*pitch, .7) * np.sin(np.pi*u/2) ** 2
        x += .14 * np.sin(2*np.pi*36*t) * u
    elif kind == 'impact':
        x = .67 * sweep(t, 115*pitch, 39*pitch, 1) * envelope(t, .003, .20, .06)
        x += .29 * noise(t, 190, 2800, rng) * envelope(t, .0015, .055, .03)
        x += .14 * metal(t, 790*pitch, .13) * envelope(t, .002, .12)
        x += .12 * noise(t, 1700, 6200, rng) * envelope(t, .002, .09)
    elif kind == 'vortex':
        # Frequencies are integer cycle counts over this exact loop duration.
        x = .32 * periodic_noise(t, rng) * (.7 + .3 * np.cos(2*np.pi*5*t/duration))
        x += .22 * np.sin(2*np.pi*73*t/duration) + .12 * np.sin(2*np.pi*147*t/duration)
    elif kind == 'release':
        x = .32 * noise(t, 120, 1600, rng) * envelope(t, .004, .16)
        x += .35 * sweep(t, 260*pitch, 62*pitch, .4) * envelope(t, .003, .11)
    elif kind == 'terminal':
        x = .56 * sweep(t, 155*pitch, 43*pitch, .9) * envelope(t, .002, .12)
        x += .28 * metal(t, 440*pitch, .14) + .16 * noise(t, 600, 3900, rng) * envelope(t, .002, .07)
    elif kind == 'remnant':
        x = .18 * periodic_noise(t, rng) * (.8 + .2*np.cos(2*np.pi*3*t/duration))
        x += .12 * np.sin(2*np.pi*132*t/duration)
    elif kind == 'stun':
        x = .38 * metal(t, 440*pitch, .14) * (.65+.35*np.cos(2*np.pi*9*t))
        x += .12 * noise(t, 600, 2400, rng) * envelope(t, .008, .10)
        x *= np.minimum(1, t/.012)
    elif kind == 'slash':
        x = .48 * noise(t, 850, 6500, rng) * np.sin(np.pi*u) ** .8
        x += .24 * sweep(t, 2100*pitch, 270*pitch, .3) * envelope(t, .001, .045)
        x += .15 * sweep(t, 240, 90, .7) * envelope(t, .001, .035)
    elif kind == 'bind':
        x = .25 * sweep(t, 160, 64, .8) * envelope(t, .002, .10)
        for i in range(4):
            dt = np.maximum(0, t - i*.022)
            gate = t >= i*.022
            x += .24 * metal(dt, (480+i*113)*pitch, .045) * gate
    elif kind == 'shield':
        x = .32 * metal(t, 410*pitch, .24) + .20 * metal(t, 615*pitch, .19)
        x += .14 * noise(t, 300, 1900, rng) * np.sin(np.pi*u) ** 2
    elif kind == 'shield-hit':
        x = .44 * metal(t, 310*pitch, .055) + .18 * noise(t, 500, 3300, rng) * envelope(t, .001, .035)
    elif kind == 'shield-break':
        x = .36 * noise(t, 1200, 6000, rng) * envelope(t, .001, .06) + .28 * metal(t, 510*pitch, .08)
    elif kind in ('siphon', 'escape', 'step'):
        starts, ends = {'siphon': (280, 870), 'escape': (110, 390), 'step': (720, 150)}[kind]
        x = .36 * sweep(t, starts*pitch, ends*pitch, .6) * np.sin(np.pi*u) ** 1.25
        x += .24 * noise(t, 140, 2400, rng) * np.sin(np.pi*u) ** 1.5
        if kind == 'siphon':
            x += .22 * metal(t, 650*pitch, .18) * np.sin(np.pi*u)
    elif kind == 'recycle':
        x = .43 * metal(t, 510*pitch, .075) * np.sin(np.pi*u) + .18 * sweep(t, 160, 400, .2) * envelope(t,.003,.07)
    elif kind == 'learn':
        x = .30 * sweep(t, 160*pitch, 320*pitch, .6) * envelope(t,.008,.24)
        for i, ratio in enumerate((1, 1.5, 2)):
            dt = np.maximum(0,t-i*.065)
            x += .25 * metal(dt, 294*ratio*pitch, .17) * (t>=i*.065)
    elif kind == 'focus':
        x = .27 * sweep(t, 420*pitch, 130*pitch, .6) * np.sin(np.pi*u) ** .7
        x += .33 * metal(t, 365*pitch, .15)
        x += .14 * noise(t, 200, 1500, rng) * envelope(t,.003,.11)
    else:
        raise ValueError(f'Unknown synthesis family: {kind}')
    if not loop:
        fade = min(round(.008*SR),len(x)//4)
        x[:fade] *= np.linspace(0,1,fade)
        x[-fade:] *= np.linspace(1,0,fade)
    x -= np.mean(x)
    if not loop:
        x[:48] *= np.linspace(0,1,48)
        x[-48:] *= np.linspace(1,0,48)
    rms = float(np.sqrt(np.mean(x*x)))
    target = 10 ** ((-29 if loop else -21 if kind in ('impact','terminal') else -25) / 20)
    x *= min(target/max(rms,1e-12), .48/max(np.max(np.abs(x)),1e-12))
    delay=9
    right=np.roll(x,delay)
    if not loop:
        right[:delay]=0
    stereo=np.stack([x*.99,right*.97],axis=1)
    return stereo, loop


def write_wav(path, samples):
    if not np.isfinite(samples).all() or np.max(np.abs(samples)) >= 1:
        raise ValueError(f'Invalid samples: {path.name}')
    pcm=np.rint(np.clip(samples,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(SR);out.writeframes(pcm.tobytes())
    return pcm.astype(float)/32767


EFFECTS=[
    ('field-deploy','领域部署','deploy',.25,1.0),('field-link','双域连线','link',.16,1.0),
    ('triangle-close','三域闭合','closure',.22,1.0),('collapse-in','向心收拢','collapse',.35,1.0),
    ('blackhole-impact','黑洞形成','impact',.72,1.0),('blackhole-loop','黑洞旋流','vortex',1.0,1.0),
    ('blackhole-release','领域消散（黑洞／余烬）','release',.32,1.0),('terminal-impact','终末奇点','terminal',.48,1.0),
    ('remnant-loop','奇点余烬','remnant',.60,1.0),('void-stun','无量空处','stun',.25,.92),
    ('slash-a','斩击领域 A','slash',.13,1.0),('slash-b','斩击领域 B','slash',.14,.88),
    ('slash-c','斩击领域 C','slash',.16,1.14),('binding-lock','禁锢扣合','bind',.28,1.0),
    ('gravity-shield','引力护盾生成','shield',.42,.92),('shield-hit','引力护盾受击','shield-hit',.12,1.0),
    ('shield-break','引力护盾破碎','shield-break',.24,.88),('escape-boost','逃逸速度','escape',.22,1.0),
    ('mass-recycle','质量回收','recycle',.16,1.0),('gravity-crush','重力碾压音色层','terminal',.25,.78),
    ('absolute-gravity','绝对引力音色层','focus',.32,.74),('echo-singularity','回响奇点续时','link',.26,.76),
    ('horizon-resonance','视界共振','shield',.28,1.12),('mass-focus','质量聚焦音色层','focus',.24,1.22),
    ('singularity-step','奇点步','step',.30,1.0),('mass-siphon','质量虹吸','siphon',.40,1.0),
    ('gravity-core','引力核心集质','focus',.28,.89),('collapse-theory','坍缩理论音色层','closure',.28,.82),
    ('critical-impact','坍缩暴击强调','impact',.20,1.26),('true-tear','奇点真伤撕裂层','slash',.14,1.30),
]
TALENTS=[
    ('gravity-core','引力核心',['gravity-core'],'收拢开始，捕获质量事件一次'),
    ('collapse-theory','坍缩理论',['collapse-theory'],'收拢音色修饰层一次'),
    ('stasis-amplifier','静滞增幅',['void-stun'],'强化眩晕窗口的伤害；沿用无量控制声，不追加逐跳音效'),
    ('rift-amplifier','裂界增幅',['slash-a','slash-b','slash-c'],'强化实际斩击波次；沿用斩击变体，不按目标数追加声部'),
    ('binding','禁锢',['binding-lock'],'收拢时成功定身的合并事件'),
    ('shield','引力护盾',['gravity-shield','shield-hit','shield-break'],'生成/消耗/耗尽分别触发'),
    ('escape','逃逸速度',['escape-boost'],'实际加速开始一次'),
    ('recycle','质量回收',['mass-recycle'],'合法退款合并事件，至少间隔0.10秒'),
    ('crush','重力碾压',['gravity-crush'],'黑洞形成的低频修饰层，不逐跳鸣响'),
    ('absolute','绝对引力',['absolute-gravity'],'满足Boss条件时的形成修饰层，不逐帧鸣响'),
    ('echo','回响奇点',['echo-singularity'],'实际续时发生时合并一次，至少间隔0.15秒'),
    ('resonance','视界共振',['horizon-resonance'],'带共振的新领域落地一次'),
    ('focus','质量聚焦',['mass-focus'],'黑洞形成的聚焦修饰层，不逐跳鸣响'),
    ('step','奇点步',['singularity-step'],'成功冲刺且涡流真正生成一次'),
    ('siphon','质量虹吸',['mass-siphon'],'实际回复量大于0的事件一次'),
]
UPGRADES=[('radius','奇点半径'),('pull','引力增幅'),('duration','视界扩张'),('projection','质量投射'),
          ('extension','领域延展'),('horizon','事件视界'),('ember','奇点余烬'),('confluence','引力汇流'),('terminal','终末奇点')]
MILESTONE_UPGRADES=[('learn-multislash','斩击领域',3,2),('learn-void','无量空处',2,3)]


def main():
    clips=[];audio={};talents={};upgrades={}
    def add(key,label,kind,duration,pitch,group):
        seed=SEED+int.from_bytes(hashlib.sha256(key.encode()).digest()[:4],'little')
        samples,loop=synth(kind,duration,seed,pitch)
        path=HERE/f'{key}.wav'
        samples=write_wav(path,samples);audio[key]=samples
        peak=float(np.max(np.abs(samples)));rms=float(np.sqrt(np.mean(samples*samples)))
        if peak<=.001 or rms<=.0001:raise ValueError(f'Empty or near-silent effect: {key}')
        clips.append({'id':key,'label':label,'group':group,'file':path.name,'duration':len(samples)/SR,
          'sampleRate':SR,'channels':2,'bits':16,'loop':loop,'seed':seed,'family':kind,'pitch':pitch,
          'peakDbfs':round(20*math.log10(peak),3),'rmsDbfs':round(20*math.log10(rms),3),
          'dc':round(float(np.mean(samples)),8),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    for key,label,kind,duration,pitch in EFFECTS:add(key,label,kind,duration,pitch,'effect')
    for i,(key,label,effects,trigger) in enumerate(TALENTS):
        learn='learn-'+key
        pitch=2**((i%12-5)/12)*(1+(i//12)*.035)
        if key=='stasis-amplifier':pitch*=1.018
        if key=='rift-amplifier':pitch*=1.027
        add(learn,label+' · 获得','learn',.46,pitch,'talent-learn')
        talents[label]={'learn':learn,'effects':effects,'trigger':trigger}
    for i,(key,label) in enumerate(UPGRADES):
        sound='upgrade-'+key
        add(sound,label+' · 武器升级','learn',.38,2**((i-4)/12)*1.16,'weapon-upgrade')
        upgrades[label]={'learn':sound,'trigger':'该条升级实际获得时一次；被动数值不逐跳播音'}
    for sound,label,old_index,level in MILESTONE_UPGRADES:
        # Keep the previously approved ability cues byte-identical after moving acquisition.
        pitch=2**((old_index%12-5)/12)*(1+(old_index//12)*.035)
        add(sound,label+' · 武器升级','learn',.46,pitch,'weapon-upgrade')
        upgrades[label]={'learn':sound,'trigger':f'武器 Lv.{level} 固定获得时一次'}
    duration=6.2;length=round(duration*SR);main_bus=np.zeros((length,2));other_bus=np.zeros_like(main_bus);events=[]
    def place(key,start,gain=1,span=None,main=False):
        source=audio[key]
        if span is not None:source=np.tile(source,(math.ceil(span*SR/len(source)),1))[:round(span*SR)]
        source=source.copy();fade=min(480,len(source)//4)
        source[:fade]*=np.linspace(0,1,fade)[:,None];source[-fade:]*=np.linspace(1,0,fade)[:,None]
        at=round(start*SR);stop=min(length,at+len(source))
        (main_bus if main else other_bus)[at:stop]+=source[:stop-at]*gain
        events.append({'id':key,'time':start,'gain':gain,'duration':len(source)/SR})
    for t in (0,.9,1.8):place('field-deploy',t,.65)
    place('field-link',1.15,.45);place('triangle-close',2.05,.40)
    place('collapse-in',2.05,.85);place('binding-lock',2.05,.45);place('gravity-core',2.05,.20)
    place('blackhole-impact',2.4,1.0,main=True);place('true-tear',2.4,.22)
    place('blackhole-loop',2.4,.35,2.2)
    for t in (2.4,3.0,3.6,4.2):place('void-stun',t,.22)
    for i,t in enumerate(np.arange(2.7,4.6,.3)):place(('slash-a','slash-b','slash-c')[i%3],float(t),.35)
    place('terminal-impact',4.6,.75,main=True);place('remnant-loop',4.6,.24,1.2)
    place('blackhole-release',5.8,.45)
    # Briefly duck secondary layers around the main formation and terminal impacts.
    tt=np.arange(length)/SR;duck=np.ones(length)
    for t in (2.4,4.6):duck*=1-.62*np.exp(-np.maximum(0,tt-t)/.11)*(tt>=t)*(tt<t+.35)
    mix=main_bus+other_bus*duck[:,None]
    mix*=min(1,.65/max(np.max(np.abs(mix)),1e-9))
    write_wav(HERE/'domain-cycle-demo.wav',mix)
    reel_keys=['field-deploy','field-link','collapse-in','blackhole-impact','blackhole-loop','void-stun',
      'slash-a','binding-lock','gravity-shield','mass-siphon','singularity-step','terminal-impact']
    silence=np.zeros((round(.24*SR),2));reel=[];reel_events=[];position=0
    for key in reel_keys:
        reel_events.append({'id':key,'time':position/SR})
        reel.extend([audio[key],silence]);position+=len(audio[key])+len(silence)
    write_wav(HERE/'skill-showreel.wav',np.concatenate(reel,axis=0)*.8)
    manifest={'status':'runtime integrated; slash/void are fixed weapon milestones; two enhancement talent cues added','sampleRate':SR,'channels':2,
      'format':'PCM 16-bit WAV','generator':'local NumPy/SciPy additive, noise, filtering and modal synthesis',
      'seed':SEED,'externalSamples':False,'voice':False,'clips':clips,'talents':talents,'weaponUpgrades':upgrades,
      'playback':{'maxVoices':8,'maxBlackHoleLoops':1,'maxTransientModifiers':2,
        'loopFadeInOutMs':12,'formationPriority':100,'collapsePriority':80,'skillPriority':60,'ambientPriority':20,
        'rule':'one formation cue per black hole; one slash variation per wave; aggregate targets; no DoT tick audio; obey mute/pause/cleanup'},
      'demo':{'file':'domain-cycle-demo.wav','duration':duration,'events':events,
        'note':'Offline art composition, not actual successful-control or combat events'},
      'showreel':{'file':'skill-showreel.wav','duration':position/SR,'events':reel_events}}
    (HERE/'audio-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'effectClips':len(EFFECTS),'talents':len(talents),'weaponUpgrades':len(upgrades),
      'totalIndividualClips':len(clips),'demoSeconds':duration,'showreelSeconds':position/SR,
      'maxIndividualPeakDbfs':max(c['peakDbfs'] for c in clips)},ensure_ascii=False))


if __name__=='__main__':main()
