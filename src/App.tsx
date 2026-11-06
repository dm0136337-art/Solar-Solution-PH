/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const SINK = 240;
const RISE = 820;
const DEPTH = 0.27;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  x = clamp((x - a) / (b - a));
  return x * x * (3 - 2 * x);
};

export default function App() {
  const [activeTime, setActiveTime] = useState<'morning' | 'night'>('night');
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assessmentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assessmentCloseRef = useRef<HTMLButtonElement | null>(null);
  const assessmentDialogRef = useRef<HTMLDivElement | null>(null);

  // References to keep animation loop synchronized without stale closures
  const pickRef = useRef<(n: number) => void>(() => {});

  useEffect(() => {
    const root = document.documentElement.style;
    const setM = document.getElementById('setM');
    const setN = document.getElementById('setN');
    const bm = document.getElementById('bm');
    const bn = document.getElementById('bn');
    const cv = canvasRef.current;
    if (!cv) return;

    const calm = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    let target = 1;
    let from = 1;
    let start = -1e9;
    let queued: number | null = null;
    let swapped = true;
    let k = 1;
    let surge = 0;
    let animating = false;
    let clock = 0;
    let rafId = 0;

    // Initialize CSS properties
    root.setProperty('--sink', '0px');
    root.setProperty('--k', '1');
    root.setProperty('--k2', '1');
    root.setProperty('--dip', '0');

    const gl = cv.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });

    const U: Record<string, WebGLUniformLocation | null> = {};

    if (gl) {
      const vs = `#version 300 es
      void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
      
      const fs = `#version 300 es
      precision highp float;
      uniform vec2 R;uniform float T,S,K;out vec4 O;
      float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);p=mat2(.8,.6,-.6,.8)*p+5.3;for(int i=0;i<5;i++){s+=a*n(p);p=m*p;a*=.5;}return s;}
      void main(){
        vec2 uv=gl_FragCoord.xy/R;uv.y=1.-uv.y;
        float asp=R.x/R.y;vec2 p=vec2(uv.x*asp,uv.y);
        float t=T*.05;
        vec2 w=vec2(fbm(p*1.3+vec2(t,-t*.6)),fbm(p*1.3+vec2(-t*.8,t)+7.));
        float d=fbm(p*1.9+w*1.7+vec2(t*1.6,-t*1.1+S*.5));
        float e=fbm(p*.9-w+vec2(-t,t*.5)+3.);
        float low=smoothstep(.70,1.04,uv.y+(d-.5)*.34);
        float side=smoothstep(.2,.0,uv.x+(e-.5)*.28)+smoothstep(.8,1.,uv.x+(e-.5)*.28);
        side*=smoothstep(.25,.6,uv.y)*.2;
        float wisps=smoothstep(.5,.78,d)*smoothstep(.22,.5,uv.y)*smoothstep(.86,.6,uv.y)*.18;
        float rest=clamp(low+side+wisps,0.,1.);
        float front=1.02-S*.68;
        float rise=smoothstep(front-.02,front+.26,uv.y+(d-.5)*.5);
        float haze=S*(.3+.46*d);
        float a=clamp(max(rest,max(rise*.97,haze)),0.,1.);
        vec3 dayA=vec3(.97,.93,.84),dayB=vec3(.79,.78,.71);
        vec3 nitA=vec3(.40,.45,.57),nitB=vec3(.15,.19,.29);
        vec3 c=mix(mix(dayB,dayA,d*1.15),mix(nitB,nitA,d*1.1),K);
        float porch=exp(-dot((uv-vec2(.72,.74))*vec2(1.7,2.6),(uv-vec2(.72,.74))*vec2(1.7,2.6))*3.2);
        c=mix(c,vec3(.86,.55,.27),K*porch*.42*(1.-S));
        O=vec4(c*a,a);
      }`;

      const sh = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
        }
        return shader;
      };

      const vertShader = sh(gl.VERTEX_SHADER, vs);
      const fragShader = sh(gl.FRAGMENT_SHADER, fs);
      const pr = gl.createProgram();

      if (vertShader && fragShader && pr) {
        gl.attachShader(pr, vertShader);
        gl.attachShader(pr, fragShader);
        gl.linkProgram(pr);
        gl.useProgram(pr);

        for (const u of ['R', 'T', 'S', 'K']) {
          U[u] = gl.getUniformLocation(pr, u);
        }
      }
    }

    function size() {
      if (!gl || !cv) return;
      const w = Math.round(Math.min(window.innerWidth, 960));
      const h = Math.round((w * window.innerHeight) / window.innerWidth);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    window.addEventListener('resize', size);
    size();

    function show(n: number) {
      setM?.classList.toggle('is-on', !n);
      setN?.classList.toggle('is-on', !!n);
      setActiveTime(n ? 'night' : 'morning');
    }

    function begin(n: number, now: number) {
      target = n;
      from = k;
      start = now;
      swapped = false;
      animating = true;
    }

    function pick(n: number) {
      if (n === target && queued === null) return;
      bm?.setAttribute('aria-pressed', (!n).toString());
      bn?.setAttribute('aria-pressed', (!!n).toString());
      setActiveTime(n ? 'night' : 'morning');

      if (calm) {
        target = n;
        k = n;
        root.setProperty('--k', n.toString());
        root.setProperty('--k2', n.toString());
        show(n);
        return;
      }
      if (animating) {
        queued = n;
      } else {
        begin(n, clock);
      }
    }

    pickRef.current = pick;

    function frame(now: number) {
      clock = now;
      const d = now - start;
      let y = 0;
      let s = 0;
      let dip = 0;
      let k2 = k;

      if (animating) {
        if (d < SINK) {
          const x = d / SINK;
          y = x * x * (3 - 2 * x) * DEPTH;
        } else {
          if (!swapped) {
            swapped = true;
            show(target);
          }
          const x = clamp((d - SINK) / RISE);
          y = Math.pow(1 - x, 3.4) * DEPTH;
        }
        s = smooth(0, SINK * 0.92, d) * (1 - smooth(SINK + 70, SINK + RISE * 0.92, d));
        dip = smooth(30, 190, d) * (1 - smooth(330, 720, d));
        k = from + (target - from) * smooth(120, 520, d);
        k2 = from + (target - from) * smooth(340, 760, d);

        if (d >= SINK + RISE) {
          animating = false;
          k = target;
          k2 = target;
          y = 0;
          s = 0;
          dip = 0;
          if (queued !== null && queued !== target) {
            const q = queued;
            queued = null;
            begin(q, now);
          } else {
            queued = null;
          }
        }
      }

      root.setProperty('--sink', (y * window.innerHeight).toFixed(1) + 'px');
      root.setProperty('--k', k.toFixed(3));
      root.setProperty('--k2', k2.toFixed(3));
      root.setProperty('--dip', dip.toFixed(3));

      if (gl && cv) {
        if (U.R) gl.uniform2f(U.R, cv.width, cv.height);
        if (U.T) gl.uniform1f(U.T, now / 1000);
        if (U.S) gl.uniform1f(U.S, s);
        if (U.K) gl.uniform1f(U.K, k);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    function loop(t: number) {
      frame(t);
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', size);
    };
  }, []);

  const handleMorningClick = useCallback(() => {
    pickRef.current(0);
  }, []);

  const handleNightClick = useCallback(() => {
    pickRef.current(1);
  }, []);

  useEffect(() => {
    if (!isAssessmentOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    assessmentCloseRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAssessmentOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !assessmentDialogRef.current) return;

      const focusableElements = assessmentDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        assessmentCloseRef.current?.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDialogKeyDown);
      assessmentTriggerRef.current?.focus();
    };
  }, [isAssessmentOpen]);

  return (
    <main className="hero">
      <div className="layer sky">
        <img
          id="skyM"
          alt=""
          src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040343_a73684b4-3f71-4613-a843-c8be80fb1211.png&w=1600&q=80"
        />
        <img
          id="skyN"
          alt=""
          src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040308_f31964ab-ed8e-4ea4-90eb-3226c0859936.png&w=1600&q=80"
        />
      </div>

      <div className="layer home">
        <div className="set" id="setM">
          <div className="layer ground">
            <img
              alt=""
              src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040259_1be34093-835e-4de4-b3a8-f875e6a74591.png&w=2560&q=85"
            />
          </div>
          <img
            className="cut"
            alt="A charcoal farmhouse with solar panels in soft morning light"
            src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040416_e3b05fa4-cc80-4a43-afde-8a0a053933e9.png&w=2560&q=85"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '50% 62%',
            }}
          />
        </div>

        <div className="set is-on" id="setN">
          <div className="layer ground">
            <img
              alt=""
              src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040211_c8fd4865-285e-4c1f-8a37-4bfe0771357b.png&w=2560&q=85"
            />
          </div>
          <img
            className="cut"
            alt="The same farmhouse at dusk with warm amber windows"
            src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261102_040415_2ab95096-8c39-449f-b36c-17c2813815a4.png&w=2560&q=85"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '50% 62%',
            }}
          />
        </div>
      </div>

      <div className="tilt" />
      <canvas id="fog" ref={canvasRef} aria-hidden="true" />

      <div className="ui">
        <header className="topbar">
          <button
            ref={assessmentTriggerRef}
            className="assessment-trigger"
            type="button"
            onClick={() => setIsAssessmentOpen(true)}
          >
            Let's Estimate
          </button>
        </header>

        <h1>
          <span className="l1">The Future of Power</span>
          <span>
            <i>is in Your Hands,</i> <span className="y"> Break Free from the Grid.</span>
          </span>
        </h1>

        <div className="dock">
          <div className="toggle" role="group" aria-label="Time of day">
            <button
              id="bm"
              aria-pressed={activeTime === 'morning'}
              onClick={handleMorningClick}
            >
              <b>Morning</b>
              <small>₱ 00.00 for Electricity</small>
            </button>
            <button
              id="bn"
              aria-pressed={activeTime === 'night'}
              onClick={handleNightClick}
            >
              <b>Night</b>
              <small>₱00.00 for Electricity</small>
            </button>
          </div>
          <p className="cap">
            Harnessing solar energy to deliver reliable, sustainable
            <br />
            and independent power beyond the grid.
          </p>
        </div>
      </div>

      {isAssessmentOpen && (
        <div
          className="assessment-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsAssessmentOpen(false);
          }}
        >
          <div
            ref={assessmentDialogRef}
            className="assessment-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Solar Energy Assessment"
          >
            <div className="assessment-header">
              <button
                ref={assessmentCloseRef}
                className="assessment-close"
                type="button"
                aria-label="Close solar energy assessment"
                onClick={() => setIsAssessmentOpen(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
