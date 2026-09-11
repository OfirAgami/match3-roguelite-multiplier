'use strict';

    function background() {
      const gl = document.querySelector('#background').getContext('webgl', { alpha: false });
      const program = gl.createProgram();
      const sources = [
        [gl.VERTEX_SHADER, `
          attribute vec2 position;
          varying vec2 uv;
          void main() {
            uv = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
          }
        `],
        [gl.FRAGMENT_SHADER, `
          precision highp float;
          varying vec2 uv;
          uniform float time;

          float hash(vec2 p) {
            vec3 q = fract(vec3(p.xyx) * 0.1031);
            q += dot(q, q.yzx + 33.33);
            return fract((q.x + q.y) * q.z);
          }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                       mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          float band(float x, float center, float slope, float width) {
            float distance = abs(x - center) / sqrt(1.0 + slope * slope);
            return 1.0 - smoothstep(width - 1.0, width + 1.0, distance);
          }
          void main() {
            vec2 p = vec2(uv.x * 941.0, (1.0 - uv.y) * 1672.0);
            // Broad, continuous ribbon sweeps.
            float t = time * 0.4;
            float y = p.y + 96.0 * sin(t);
            float a = (y - 135.0) / 140.0;
            float bulge = 190.0 * exp(-a * a);
            float left = band(p.x, -40.0 + bulge + 84.0 * sin(t * 0.83),
                              -2.0 * a * bulge / 140.0, 33.0);
            left *= 1.0 - smoothstep(340.0, 410.0, p.y);

            y = p.y + 108.0 * sin(t * 0.91 + 1.0);
            a = (y - 540.0) / 100.0;
            bulge = 180.0 * exp(-a * a);
            float right = band(p.x, 1045.0 - bulge + 72.0 * sin(t + 2.0),
                               2.0 * a * bulge / 100.0, 27.0);

            y = p.y + 120.0 * sin(t * 0.77 + 3.0);
            float f = clamp((y - 1250.0) / 490.0, 0.0, 1.0);
            // Keep the clamped upper end offscreen, including its full drift and width.
            float bottom = band(p.x, -180.0 + 540.0 * f * f * (3.0 - 2.0 * f)
                                + 96.0 * sin(t * 0.87 + 4.0),
                                540.0 * 6.0 * f * (1.0 - f) / 490.0, 51.5);

            vec3 color = mix(vec3(22, 14, 33), vec3(45, 21, 61),
                             max(left, max(right, bottom))) / 255.0;
            float shade = 0.75 * (1.0 - smoothstep(90.0, 980.0, length(p - vec2(475, 820))));
            color = mix(color, vec3(16, 11, 25) / 255.0, shade);
            float cloud = noise(p / 180.0) * 0.65 + noise(p / 65.0) * 0.35;
            // Stationary procedural grain, with no sampled textures.
            float grain = hash(floor(p * 1.5)) - 0.5;
            float fibers = noise(p * vec2(0.7, 0.14)) - 0.5;
            color += (cloud - 0.5) * 0.013 + grain * 0.024 + fibers * 0.010;
            gl_FragColor = vec4(color, 1.0);
          }
        `],
      ];
      for (const [type, source] of sources) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const time = gl.getUniformLocation(program, 'time');
      const started = performance.now();
      function frame(now) {
        gl.uniform1f(time, (now - started) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }


// All mutable values below are visual state. Game owns rules, RNG and timing.
function createCanvasView(canvas, G) {
    const ctx = canvas.getContext('2d');
    const W = 941, H = 1672;
    const resolution = window.devicePixelRatio;
    canvas.width = W * resolution;
    canvas.height = H * resolution;
    ctx.scale(resolution, resolution);
    const cream = '#fff8dd', lavender = '#a090c7';
    const colors = {
      O: ['#f5a04d', '#e17c31', '#815027'],
      R: ['#f54b50', '#ec3e44', '#852431'],
      Y: ['#eab34a', '#dca33d', '#795027'],
      G: ['#80b29a', '#6da48e', '#314b53'],
      P: ['#c9b4df', '#b8a1d1', '#433553'],
      B: ['#718fdb', '#5f7ecc', '#33335d'],
    };
    const shapes = {
      O: new Path2D('M 0 -42 L 42 0 L 0 42 L -42 0 Z'),
      R: new Path2D('M -12 -42 Q -17 -42 -17 -37 L -17 -19 L -35 -19 Q -40 -19 -40 -14 L -40 12 Q -40 17 -35 17 L -17 17 L -17 36 Q -17 41 -12 41 L 12 41 Q 17 41 17 36 L 17 17 L 35 17 Q 40 17 40 12 L 40 -14 Q 40 -19 35 -19 L 17 -19 L 17 -37 Q 17 -42 12 -42 Z'),
      Y: new Path2D('M -33 -40 L 33 -40 Q 40 -40 40 -33 L 40 31 Q 40 38 33 38 L -33 38 Q -40 38 -40 31 L -40 -33 Q -40 -40 -33 -40 Z M -13 -15 L -13 13 L 14 13 L 14 -15 Z'),
      G: new Path2D('M -5 -39 Q 0 -41 6 -39 Q 9 -39 12 -32 L 41 22 Q 47 35 35 37 L -34 37 Q -46 36 -41 23 L -12 -32 Q -9 -39 -5 -39 Z'),
      P: new Path2D('M -8 -40 A 42 41 0 1 0 8 -40 L 8 -14 L -8 -14 Z'),
      B: new Path2D('M -33 -39 L 34 -39 Q 38 -39 38 -35 L 38 -10 L -5 -10 L -5 7 L 13 36 Q 15 39 11 39 L -25 39 L -38 26 L -38 -34 Q -38 -39 -33 -39 Z'),
    };

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    }

    function text(value, x, top, height, width, color, align = 'center', font = 'Anton') {
      ctx.save();
      ctx.font = `120px ${font}`;
      const m = ctx.measureText(value);
      ctx.translate(x, top);
      ctx.scale(width / m.width, height / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent));
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, 0, m.actualBoundingBoxAscent);
      ctx.restore();
    }

    function tile(kind, x, y) {
      const path = shapes[kind], palette = colors[kind];
      ctx.save();
      ctx.translate(x + 6, y + 13);
      ctx.fillStyle = '#07060cc9';
      ctx.fill(path);
      ctx.translate(-6, -6);
      ctx.fillStyle = palette[2];
      ctx.fill(path);
      ctx.translate(0, -7);
      const face = ctx.createLinearGradient(-38, -40, 40, 38);
      face.addColorStop(0, palette[0]);
      face.addColorStop(1, palette[1]);
      ctx.fillStyle = face;
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      ctx.translate(0, 1);
      ctx.strokeStyle = '#ffffff24';
      ctx.lineWidth = 2;
      ctx.stroke(path);
      ctx.restore();
      ctx.restore();
    }

    const kinds = ['R', 'Y', 'G', 'B', 'P', 'O'];
    const positions = new Map(), effects = new Map(), clearBursts = new Map();
    let drag = null, phase, boardRef, shakeStart = 0, shaking = false, boardTime = 0;
    let powerPage = 0;
    let impact = null, lastScore = 0, lastAward, impactRun, scorePunch = -Infinity;
    const haptic = ms => navigator.vibrate?.(ms);

    function impactValue(now) {
      if (impact.ended !== null) return impact.amount;
      const ease = 1 - 2 ** (-(now - impact.start) / 1000 * 10);
      // Geometric interpolation with a +1 offset so count-ups can start at zero.
      return Math.expm1(Math.log1p(impact.from) + (Math.log1p(impact.amount) - Math.log1p(impact.from)) * ease);
    }

    function updateImpact(now) {
      if (impactRun !== G.run || G.score < lastScore) {
        impact = null; lastScore = G.score; lastAward = G.scoreImpact; impactRun = G.run; scorePunch = -Infinity;
      }
      // The score settles independently of input; another move carries it forward.
      if (impact && impact.settled !== null && impact.ended === null && now - impact.settled >= CONFIG.SCORE_SETTLE_MS) {
        impact.ended = impact.settled + CONFIG.SCORE_SETTLE_MS;
        haptic(12);
      }
      if (impact && impact.ended !== null && now - impact.ended >= CONFIG.SCORE_TRANSFER_MS) {
        scorePunch = impact.ended + CONFIG.SCORE_TRANSFER_MS;
        impact = null;
      }
      if (impact && impact.move !== G.moveNum) {
        impact.from = impactValue(now);
        impact.start = now;
        impact.move = G.moveNum;
        impact.settled = null;
        impact.ended = null;
      }
      if (G.scoreImpact && G.scoreImpact !== lastAward) haptic(10);
      const gained = G.score - lastScore;
      if (gained > 0) {
        const continuing = impact;
        const award = G.scoreImpact !== lastAward ? G.scoreImpact : null;
        impact = { start: now, born: continuing ? impact.born : now, settled: null, ended: null,
          from: continuing ? impactValue(now) : 0,
          move: G.moveNum, amount: gained + (continuing ? impact.amount : 0),
          multiplier: G.run.multiplier, cascade: award ? award.cascade : continuing ? impact.cascade : 0,
          cells: award ? award.cells : [] };
      }
      lastScore = G.score; lastAward = G.scoreImpact;
      if (impact && !G.busy && impact.settled === null) impact.settled = now;
    }

    function drawImpact(now) {
      if (!impact) return;
      const age = now - impact.start;
      const enter = Math.min(1, age / 60);
      const leave = impact.ended === null ? 0 : Math.min(1, (now - impact.ended) / CONFIG.SCORE_TRANSFER_MS);
      const travel = 2.70158 * leave ** 3 - 1.70158 * leave ** 2;
      const punch = Math.sin(enter * Math.PI);
      const strength = Math.min(1, Math.max((impact.cascade - 1) / 7, Math.log2(impact.multiplier) / 8));
      const size = (.72 + strength * .28) * (1 + punch * .18) * (1 - leave * .18);
      const l = layout(), cells = impact.cells;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      const alpha = (1 - leave) * Math.min(1, (now - impact.born) / 12);
      ctx.globalAlpha = alpha;

      // One brief connection to the actual clear; no timers or gameplay waits.
      if (cells.length && age < 120) {
        ctx.save();
        ctx.globalAlpha *= 1 - (age / 120) ** 2;
        const byCell = new Map(cells.map(c => [K(c.r, c.c), c]));
        ctx.strokeStyle = cream; ctx.lineWidth = l.cell * .24; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const c of cells) for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const next = byCell.get(K(c.r + dr, c.c + dc));
          if (next && next.color === c.color) {
            ctx.moveTo(l.x + (c.c + .5) * l.cell, l.y + (c.r + .5) * l.cell);
            ctx.lineTo(l.x + (next.c + .5) * l.cell, l.y + (next.r + .5) * l.cell);
          }
        }
        ctx.stroke();
        const centerR = cells.reduce((sum, c) => sum + c.r, 0) / cells.length;
        const centerC = cells.reduce((sum, c) => sum + c.c, 0) / cells.length;
        const source = cells.reduce((a, b) => (a.r - centerR) ** 2 + (a.c - centerC) ** 2 <
          (b.r - centerR) ** 2 + (b.c - centerC) ** 2 ? a : b);
        const x = l.x + (source.c + .5) * l.cell, y = l.y + (source.r + .5) * l.cell;
        ctx.translate(471, 465);
        ctx.rotate(Math.atan2(y - 465, x - 471) - Math.PI / 2);
        const length = Math.hypot(x - 471, y - 465);
        ctx.beginPath();
        ctx.moveTo(-13, 0); ctx.lineTo(36, 0); ctx.lineTo(-5, length * .32);
        ctx.lineTo(18, length * .29); ctx.lineTo(-7, length * .69);
        ctx.lineTo(4, length * .65); ctx.lineTo(0, length);
        ctx.lineTo(-23, length * .58); ctx.lineTo(-8, length * .61);
        ctx.lineTo(-37, length * .37); ctx.lineTo(-18, length * .39); ctx.closePath();
        ctx.lineWidth = 7; ctx.strokeStyle = cream; ctx.fillStyle = '#ff3942';
        ctx.stroke(); ctx.fill();
        ctx.restore();
      }

      ctx.translate(471, 315 + (85 - 315) * travel - Math.sin(enter * Math.PI) * 9);
      ctx.scale(size, size);
      ctx.rotate((-.1 - punch * .085) * (1 - leave));
      const value = `+${Math.round(impactValue(now)).toLocaleString('en-US')}`;
      const width = Math.min(815, Math.max(340, (`+${impact.amount.toLocaleString('en-US')}`).length * 83));
      const edge = width / 2 + 35;
      const corners = [[-edge - 40, 140], [-edge + 25, 69], [-edge - 50, -40],
        [-edge + 44, -34], [-edge + 5, -156], [-170, -115], [-105, -196], [-94, -139],
        [135, -206], [96, -148], [edge + 10, -219], [edge - 22, -141],
        [edge + 76, -170], [edge + 16, -44], [edge + 68, 42], [edge + 12, 77],
        [edge + 56, 178], [edge - 66, 130], [264, 223], [163, 165],
        [-112, 199], [-146, 155], [-264, 200], [-241, 143]];
      const burst = new Path2D();
      // Cut each point into a broad flat tip, keeping every edge straight.
      corners.forEach(([x, y], i) => {
        const prev = corners[(i + corners.length - 1) % corners.length], next = corners[(i + 1) % corners.length];
        burst[i ? 'lineTo' : 'moveTo'](x + (prev[0] - x) * .22, y + (prev[1] - y) * .22);
        burst.lineTo(x + (next[0] - x) * .22, y + (next[1] - y) * .22);
      });
      burst.closePath();
      // Ten silhouette changes per second, independent of the score punch.
      const burstFrame = Math.floor((now - impact.born) / 100);
      ctx.save();
      ctx.scale(burstFrame % 2 ? -1 : 1, burstFrame % 3 === 0 ? -.94 : 1);
      ctx.rotate((burstFrame % 3 - 1) * .035);
      ctx.save(); ctx.translate(9, 13); ctx.fillStyle = '#0d0915'; ctx.fill(burst); ctx.restore();
      ctx.lineJoin = 'bevel'; ctx.lineWidth = 7; ctx.strokeStyle = cream; ctx.stroke(burst);
      ctx.fillStyle = '#ff3942'; ctx.fill(burst);
      ctx.restore();

      // Repeat the same glyphs to make a solid comic extrusion, then the cream face.
      ctx.save();
      ctx.font = '120px Anton';
      const metrics = ctx.measureText(value);
      ctx.translate(0, -116);
      ctx.scale(width / metrics.width, 222 / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent));
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#100b19'; ctx.fillStyle = '#100b19'; ctx.lineWidth = 5;
      for (let depth = 19; depth >= 0; depth--) {
        ctx.strokeText(value, depth * .65, metrics.actualBoundingBoxAscent + depth);
        ctx.fillText(value, depth * .65, metrics.actualBoundingBoxAscent + depth);
      }
      ctx.fillStyle = cream; ctx.fillText(value, 0, metrics.actualBoundingBoxAscent);
      ctx.restore();

      ctx.restore();
      // Tags have a fixed anchor, regardless of cascade count or score punches.
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(471, 315 + (85 - 315) * travel);
      ctx.scale(.85 * (1 - leave * .18), .85 * (1 - leave * .18)); ctx.rotate(-.1 * (1 - leave));
      const mult = `×${impact.multiplier.toLocaleString('en-US')}`;
      const multWidth = Math.min(360, Math.max(150, mult.length * 58));
      const cascadeWidth = impact.cascade > 1 ? 193 : 0;
      const left = -(multWidth + 193) / 2;
      ctx.fillStyle = '#100b19'; roundRect(left - 8, 131, multWidth + 16, 106, 5); ctx.fill();
      ctx.fillStyle = '#ff3942'; roundRect(left, 123, multWidth, 101, 4); ctx.fill();
      text(mult, left + multWidth / 2, 135, 72, multWidth - 22, '#100b19');
      if (cascadeWidth) {
        ctx.fillStyle = '#100b19'; roundRect(left + multWidth + 8, 150, 185, 62, 3); ctx.fill();
        text(`CASCADE ${impact.cascade}`, left + multWidth + 100, 166, 30, 162, lavender);
      }
      ctx.restore();
    }

    function layout() {
      const cell = Math.min(849 / G.cols, 807 / G.rows);
      return { cell, x: (W - G.cols * cell) / 2, y: 605 + (820 - G.rows * cell) / 2 };
    }

    function label(value, x, y, size = 28, color = cream, align = 'center') {
      ctx.font = `${size}px Anton, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x, y);
      ctx.textBaseline = 'alphabetic';
    }

    function badge(value, x, y, color = cream) {
      ctx.font = '23px Anton';
      const width = ctx.measureText(String(value)).width + 16;
      roundRect(x - width / 2, y - 16, width, 32, 8);
      ctx.fillStyle = '#150e22'; ctx.fill();
      label(value, x, y, 23, color);
    }

    function position(p, now) {
      const t = Math.min(1, (now - p.start) / p.duration);
      const ease = p.falling ? 1 + 2.3 * (t - 1) ** 3 + 1.3 * (t - 1) ** 2 : 1 - (1 - t) ** 3;
      return { x: p.fromX + (p.x - p.fromX) * ease, y: p.fromY + (p.y - p.fromY) * ease };
    }

    function drawBoard(now) {
      const l = layout(), active = new Set();
      const settle = 1 - Math.exp(-(now - boardTime) / 45);
      boardTime = now;
      ctx.save();
      if (G.shake && !shaking) shakeStart = now;
      shaking = !!G.shake;
      if (shaking) {
        const age = (now - shakeStart) / G.animationMs(320);
        const amp = G.shake * Math.max(0, 1 - age) * l.cell / 56;
        ctx.translate(Math.sin(age * 35) * amp, Math.cos(age * 29) * amp * .6);
      }
      roundRect(40, 605, 861, 820, 10);
      ctx.fillStyle = '#09070f85'; ctx.fill();
      // Tile entry is clipped at the top, as falling pieces enter the board.
      ctx.save();
      const cells = G.board.flatMap((row, r) => row.map((_, c) => ({ r, c })));
      // The held piece renders last, above its neighbours and outside the fall clip.
      if (drag) cells.push(...cells.splice(drag.r * G.cols + drag.c, 1));
      for (const { r, c } of cells) {
        const t = G.board[r][c], key = K(r, c);
        const x = l.x + (c + .5) * l.cell, y = l.y + (r + .5) * l.cell;
        const mark = G.marks.has(key), pinata = G.pinatas.has(key), triple = G.triples.has(key);
        if (mark || pinata || triple) {
          ctx.strokeStyle = pinata ? '#e998c6' : triple ? '#8bd6c8' : '#efcd79';
          ctx.fillStyle = pinata ? '#e998c61b' : triple ? '#8bd6c81b' : '#efcd791b';
          ctx.lineWidth = 2;
          roundRect(x - l.cell * .48, y - l.cell * .48, l.cell * .96, l.cell * .96, 9);
          ctx.fill(); ctx.stroke();
        }
        if (!t) continue;
        active.add(t.id);
        const ty = l.y + ((t.enter ?? r) + .5) * l.cell;
        let p = positions.get(t.id);
        if (!p) {
          p = { x, y: ty, fromX: x, fromY: ty, start: now, duration: 1, flags: {}, nudgeX: 0, nudgeY: 0, lift: 0 };
          positions.set(t.id, p);
        }
        if (p.x !== x || p.y !== ty) {
          const at = position(p, now);
          // Commit the preview pose into the normal swap animation without a jump.
          at.x += p.nudgeX; at.y += p.nudgeY;
          p.nudgeX = 0; p.nudgeY = 0;
          Object.assign(p, { fromX: at.x, fromY: at.y, x, y: ty, start: now,
            duration: G.fast ? 1 : G.animationMs(t.fallDist ? G.fallDur(t.fallDist) : CONFIG.SWAP_MS), falling: !!t.fallDist });
        }
        const popDelay = t.popKind === 'boom' || t.popKind === 'zap' ? 0 : G.animationMs(t.popDelay || 0);
        for (const flag of ['pop', 'fresh', 'wiggle', 'cflash', 'chomp']) {
          if (t[flag] && p.flags[flag] === undefined) {
            p.flags[flag] = now;
            if (flag === 'pop') {
              const at = position(p, now);
              p.clearPose = { x: at.x + p.nudgeX, y: at.y + p.nudgeY };
              clearBursts.set(t.id, {
                x: p.clearPose.x, y: p.clearPose.y,
                color: colors[kinds[t.color] || 'Y'][0], size: l.cell / 112.7,
                start: now + popDelay,
                duration: G.animationMs(t.special ? 480 : 380), special: !!t.special,
              });
            }
          }
          if (!t[flag]) delete p.flags[flag];
        }
        const at = t.pop ? { ...p.clearPose } : position(p, now);
        const held = drag && drag.r === r && drag.c === c;
        const target = drag && !held && drag.target.r === r && drag.target.c === c;
        if (target) p.wasTarget = true;
        const dx = drag ? c - drag.target.c : 0, dy = drag ? r - drag.target.r : 0;
        const distance = Math.hypot(dx, dy);
        const push = drag && !held && !p.wasTarget && distance > 0 && distance <= Math.SQRT2 ? l.cell * .12 / distance : 0;
        const offsetX = held ? (drag.target.c - c) * l.cell : target ? (drag.c - c) * l.cell : dx * push;
        const offsetY = held ? (drag.target.r - r) * l.cell : target ? (drag.r - r) * l.cell : dy * push;
        p.nudgeX += (offsetX - p.nudgeX) * settle;
        p.nudgeY += (offsetY - p.nudgeY) * settle;
        if (!t.pop) p.lift += ((held ? 1 : 0) - p.lift) * settle;
        if (!t.pop) { at.x += p.nudgeX; at.y += p.nudgeY; }
        ctx.save();
        if (!held) { ctx.beginPath(); ctx.rect(34, 605, 873, 834); ctx.clip(); }
        ctx.translate(at.x, at.y); ctx.scale(l.cell / 112.7, l.cell / 112.7);
        ctx.scale(1 + p.lift * .18, 1 + p.lift * .18);
        if (t.wiggle) {
          const progress = Math.min(1, (now - p.flags.wiggle) / G.animationMs(350));
          ctx.translate(Math.sin(progress * Math.PI * 8) * 8 * (1 - progress), 0);
        }
        let flash = 0;
        if (t.pop) {
          // Start bursting immediately, without a landing animation.
          const progress = Math.max(0, Math.min(1, (now - p.flags.pop - popDelay) / G.animationMs(150)));
          const started = now >= p.flags.pop + popDelay;
          const scale = started ? 1.18 * (1 - progress) : 1;
          ctx.globalAlpha = Math.min(1, (1 - progress) / .65);
          flash = started ? (1 - progress) * .85 : 0;
          ctx.scale(scale, scale);
        } else if (t.fresh) {
          const progress = Math.min(1, (now - p.flags.fresh) / G.animationMs(350));
          const scale = .2 + .8 * (1 + 2.3 * (progress - 1) ** 3 + 1.3 * (progress - 1) ** 2);
          ctx.scale(scale, scale);
        }
        if (t.chomp) {
          const age = (now - p.flags.chomp) / G.animationMs(500);
          const scale = 1 + Math.sin(age * 16) * .2 * Math.max(0, 1 - age);
          ctx.scale(scale, scale);
        }
        const kind = kinds[t.color] || 'Y';
        if (t.special || (t.volatile || 0) > (G.moveNum || 0) || t.cflash) {
          ctx.shadowColor = t.volatile > G.moveNum ? '#ff614d' : colors[kind][0];
          ctx.shadowBlur = 15 + 5 * Math.sin(now / 130);
        }
        if (t.chest || t.chomper) {
          roundRect(-39, -39, 78, 78, t.chomper ? 39 : 10);
          ctx.fillStyle = t.chomper ? '#397e77' : '#ac7841'; ctx.fill();
          label(t.chomper ? '😬' : '🎁', 0, 0, 49);
        } else tile(kind, 0, 0);
        ctx.shadowBlur = 0;
        if (flash > 0 && !t.chest && !t.chomper) {
          ctx.save();
          ctx.globalAlpha *= flash;
          ctx.strokeStyle = cream; ctx.lineWidth = 5;
          ctx.stroke(shapes[kind]);
          ctx.fillStyle = cream;
          ctx.fill(shapes[kind]);
          ctx.restore();
        }
        if (t.special) {
          badge(t.special === 'arrow' ? (t.dir === 'h' ? '↔' : '↕') : SPECIAL_EMOJI[t.special], 0, 0);
          if (t.countdown !== null) badge(Math.max(0, t.countdown), 33, -34, '#efcd79');
        }
        const value = 1 + (G.mods.boosts[t.color] || 0) + (t.special ? G.mods.specialScore : 0);
        if (value > 1) badge(value, -24, 32, t.special && G.mods.specialScore ? '#efcd79' : cream);
        ctx.restore();
      }
      for (const id of positions.keys()) if (!active.has(id)) positions.delete(id);
      // Cell labels stay anchored while their pieces move.
      for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
        const key = K(r, c), x = l.x + (c + .23) * l.cell, y = l.y + (r + .13) * l.cell;
        ctx.save(); ctx.translate(x, y); ctx.scale(l.cell / 112.7, l.cell / 112.7);
        if (G.marks.has(key)) badge('↻', 0, 0, '#efcd79');
        if (G.pinatas.has(key)) badge(`🪅 ${G.pinatas.get(key)}`, 0, 0, '#e998c6');
        if (G.triples.has(key)) badge(`×${CONFIG.TRIPLE_TILE_MULT}`, 0, 0, '#8bd6c8');
        ctx.restore();
      }
      ctx.restore();
      if (G.phase === 'level' && G.movesLeft > 0 && G.movesLeft <= 3) {
        ctx.globalAlpha = .35 + .25 * Math.sin(now / (G.movesLeft * 100));
        ctx.strokeStyle = '#ff554f'; ctx.shadowColor = '#ff554f'; ctx.shadowBlur = 22; ctx.lineWidth = 5;
        roundRect(40, 605, 861, 820, 10); ctx.stroke();
      }
      ctx.restore();
    }

    function drawClearBursts(now) {
      // Outlive the removed tile and keep the clear's cascade speed.
      for (const [id, burst] of clearBursts) {
        const t = (now - burst.start) / burst.duration;
        if (t < 0) continue;
        if (t >= 1) { clearBursts.delete(id); continue; }
        const travel = 1 - (1 - t) ** 3;
        ctx.save();
        ctx.translate(burst.x, burst.y);
        ctx.scale(burst.size, burst.size);
        ctx.globalAlpha = (1 - t) ** 2;
        ctx.strokeStyle = burst.color;
        ctx.lineWidth = 5 * (1 - t);
        ctx.beginPath(); ctx.arc(0, 0, 18 + travel * (burst.special ? 72 : 49), 0, Math.PI * 2); ctx.stroke();
        const count = burst.special ? 10 : 7;
        for (let i = 0; i < count; i++) {
          const angle = i / count * Math.PI * 2 + id * 2.399;
          const distance = 16 + travel * (38 + (id + i * 13) % 29);
          const size = (i % 3 === 0 ? 9 : 6) * (1 - t * .75);
          ctx.save();
          ctx.translate(Math.cos(angle) * distance, Math.sin(angle) * distance + t * t * 25);
          ctx.rotate(angle + t * (i % 2 ? 3 : -3));
          ctx.fillStyle = i % 3 === 0 ? cream : burst.color;
          ctx.fillRect(-size / 2, -size, size, size * 2);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    function drawEffects(now) {
      const l = layout(), active = new Set();
      for (const f of [...G.fx, ...G.callouts]) {
        if (f.cls?.split(' ').some(cls => cls === 'score' || cls === 'combo')) continue;
        active.add(f.id);
        if (!effects.has(f.id)) effects.set(f.id, now);
        const age = now - effects.get(f.id) - (f.kind === 'wave' ? 0 : G.animationMs(f.delay || 0));
        if (age < 0) continue;
        const isCallout = f.r === undefined;
        const duration = G.animationMs(isCallout ? 1500 : f.kind === 'part' ? 500 : f.kind === 'wave' ? 550 : f.cls?.includes('combo') ? 1000 : 800);
        const progress = Math.min(1, age / duration);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress ** 3);
        const x = isCallout ? W / 2 : l.x + (f.c + .5) * l.cell;
        const y = isCallout ? 480 + G.callouts.indexOf(f) * 55 : l.y + (f.r + .5) * l.cell;
        if (f.kind === 'part') {
          ctx.fillStyle = colors[kinds[f.color] || 'Y'][0];
          ctx.beginPath(); ctx.arc(x + f.dx * progress * l.cell / 56, y + f.dy * progress * l.cell / 56, 8 * (1 - progress) + 1, 0, Math.PI * 2); ctx.fill();
        } else if (f.kind === 'wave') {
          ctx.strokeStyle = '#ffdc91'; ctx.lineWidth = 5 * (1 - progress);
          ctx.beginPath(); ctx.arc(x, y, f.size * l.cell * (.12 + .88 * progress) / 2, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.shadowColor = '#09070f'; ctx.shadowBlur = 8;
          label(f.text, x, y - progress * (isCallout ? 14 : 80), isCallout ? 36 : f.cls?.includes('big') ? 40 : 32, f.cls?.includes('danger') ? '#ff8b7d' : cream);
        }
        ctx.restore();
      }
      for (const id of effects.keys()) if (!active.has(id)) effects.delete(id);
    }

    function meter(title, value, total, y, color) {
      label(title, 84, y, 23, lavender, 'left');
      ctx.fillStyle = '#30223e'; roundRect(263, y - 6, 480, 12, 6); ctx.fill();
      const width = 480 * Math.min(1, value / total);
      ctx.fillStyle = color; roundRect(263, y - 6, width, 12, 6); ctx.fill();
      label(`${value}/${total}`, 854, y, 23, lavender, 'right');
    }

    function powerIcon(chip, x, y) {
      const id = chip.def.id;
      ctx.fillStyle = cream; ctx.strokeStyle = cream; ctx.lineWidth = 6;
      if (id === 'blast' || id === 'bombchance' || id === 'squarebomb') {
        ctx.beginPath(); ctx.arc(x - 8, y + 7, 26, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 4, y - 14); ctx.quadraticCurveTo(x + 7, y - 36, x + 26, y - 27); ctx.stroke();
        label('✦', x + 29, y - 31, 35);
      } else if (id === 'spawner' || id === 'specialscore') label('★', x, y, 79);
      else if (id === 'sweep' || id === 'expandrow') label('↑↑↑', x, y, 52);
      else if (id === 'conveyor' || id === 'xtramove') label('⟳', x, y, 87);
      else label(chip.def.icon, x, y, 65);
    }

    function drawPowers() {
      const chips = buildChips(G), start = powerPage * 5;
      for (let i = 0; i < 5; i++) {
        const x = 104 + i * 152, chip = chips[start + i];
        ctx.save();
        ctx.globalAlpha = chip ? chip.def.id === 'lifesaver' && G.run.lifesaverUsed ? .35 : 1 : .35;
        roundRect(x, 1448, 124, 121, 10);
        ctx.fillStyle = '#0c0913b0'; ctx.fill();
        ctx.strokeStyle = '#30223e'; ctx.lineWidth = 5; ctx.stroke();
        if (chip) {
          powerIcon(chip, x + 62, 1507);
          if (chip.count > 1) badge(`×${chip.count}`, x + 106, 1550, cream);
          if (chip.pick.color !== undefined) {
            ctx.fillStyle = colors[kinds[chip.pick.color]][0];
            ctx.beginPath(); ctx.arc(x + 21, 1550, 10, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      if (phase !== G.phase || boardRef !== G.board) {
        drag = null;
        if (!G.board) { positions.clear(); effects.clear(); clearBursts.clear(); }
        phase = G.phase; boardRef = G.board;
      }
      if (!G.board) return;
      updateImpact(now);
      const score = G.score.toLocaleString('en-US'), target = G.nextTarget().toLocaleString('en-US');
      text('TARGET', 204, 30, 20, 82, lavender);
      text(target, 204, 63, 36, Math.min(215, target.length * 23), lavender, 'center', 'Bungee');
      const punch = 1 + .16 * Math.sin(Math.min(1, (now - scorePunch) / 240) * Math.PI);
      ctx.save(); ctx.translate(471, 68); ctx.scale(punch, punch); ctx.translate(-471, -68);
      text('SCORE', 471, 25, 25, 94, cream);
      text(score, 471, 61, 49, Math.min(280, score.length * 30), cream, 'center', 'Bungee');
      ctx.restore();
      text('MOVES', 738, 30, 20, 74, lavender);
      text(String(G.movesLeft).padStart(2, '0'), 738, 63, 35, Math.max(52, String(G.movesLeft).length * 26), G.movesLeft <= 3 ? '#f37a78' : lavender, 'center', 'Bungee');
      ctx.fillStyle = '#82719e'; ctx.fillRect(333, 28, 2, 82); ctx.fillRect(637, 28, 2, 82);
      const mult = `×${G.run.multiplier.toLocaleString('en-US')}`;
      if (!impact) text(mult, 471, 381, 49, Math.min(660, mult.length * 33.5), lavender, 'center', 'Bungee');
      const cps = G.checkpoints(), idx = G.run.checkpointIdx;
      const prev = G.run.finalReached ? G.nextTarget() - G.run.endlessDelta : idx ? cps[idx - 1] : 0;
      const fraction = Math.max(0, Math.min(1, (G.score - prev) / (G.nextTarget() - prev)));
      const progress = G.run.finalReached ? fraction : (idx + fraction) / cps.length;
      ctx.fillStyle = '#30223e'; roundRect(84, 465, 770, 5, 2); ctx.fill();
      ctx.fillStyle = lavender; roundRect(84, 465, progress * 770, 5, 2); ctx.fill();
      if (!G.run.finalReached) for (let i = 1; i <= cps.length; i++) {
        ctx.fillStyle = G.score >= cps[i - 1] ? cream : '#59456f'; ctx.fillRect(84 + i / cps.length * 770 - 2, 461, 4, 13);
      }
      label(G.run.finalReached ? `ENDLESS ROUND ${G.run.endlessRound + 1}` : `CHECKPOINT ${idx} / ${cps.length}`, 471, 502, 21, lavender);
      let y = 548;
      if (G.mods.fillup) { meter('FILL-UP', G.run.fillCount - CONFIG.FILL_UP_THRESHOLD * G.run.fillTriggers, CONFIG.FILL_UP_THRESHOLD, y, '#80b29a'); y += 40; }
      if (G.run.picks.some(p => p.id === 'momentum' || p.id === 'xtramove')) meter('BONUS MOVE', Math.min(G.run.momentum || 0, G.momentumNeed()), G.momentumNeed(), y, '#eab34a');
      drawBoard(now);
      drawClearBursts(now);
      if (G.phase !== 'draft') drawPowers();
      drawEffects(now);
      drawImpact(now);
    }

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
    }
    function cellAt(p) {
      const l = layout(), r = Math.floor((p.y - l.y) / l.cell), c = Math.floor((p.x - l.x) / l.cell);
      return r >= 0 && r < G.rows && c >= 0 && c < G.cols ? { r, c } : null;
    }
    function down(e) {
      if (G.phase !== 'level' || G.busy || drag) return;
      const p = point(e), cell = cellAt(p);
      if (!cell || !G.board[cell.r][cell.c] || G.board[cell.r][cell.c].chomper) return;
      if (G.fast) { G.fast = false; G.render(); }
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      for (const p of positions.values()) p.wasTarget = false;
      drag = { ...cell, target: cell, pointerId: e.pointerId };
      haptic(6);
      move(e);
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const p = point(e), l = layout();
      let closest = Infinity;
      for (let r = Math.max(0, drag.r - 1); r <= Math.min(G.rows - 1, drag.r + 1); r++) {
        for (let c = Math.max(0, drag.c - 1); c <= Math.min(G.cols - 1, drag.c + 1); c++) {
          if ((r !== drag.r || c !== drag.c) && !G.isSwappable(drag, { r, c })) continue;
          if (!G.board[r][c] || G.board[r][c].chomper) continue;
          const distance = (p.x - l.x - (c + .5) * l.cell) ** 2 + (p.y - l.y - (r + .5) * l.cell) ** 2;
          if (distance < closest) { closest = distance; drag.target = { r, c }; }
        }
      }
    }
    function release() {
      const d = drag;
      drag = null;
      return d;
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      move(e);
      const d = release();
      haptic(8);
      if (G.isSwappable(d, d.target)) {
        const l = layout();
        for (const [source, target] of [[d, d.target], [d.target, d]]) {
          const p = positions.get(G.board[source.r][source.c].id);
          const x = l.x + (target.c + .5) * l.cell, y = l.y + (target.r + .5) * l.cell;
          Object.assign(p, { x, y, fromX: x, fromY: y, nudgeX: 0, nudgeY: 0 });
        }
        G.trySwap({ r: d.r, c: d.c }, d.target, true);
      }
    }
    return { draw, down, move, up, cancel: release, setPowerPage: page => { powerPage = page; } };
}

function MultiplierCanvas({ G }) {
  const ref = React.useRef(null), view = React.useRef(null);
  const [page, setPage] = React.useState(0), [info, setInfo] = React.useState(null);
  React.useEffect(() => {
    view.current = createCanvasView(ref.current, G);
    let frameId;
    const frame = now => { view.current.draw(now); frameId = requestAnimationFrame(frame); };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);
  const chips = G.run ? buildChips(G) : [], pages = Math.max(1, Math.ceil(chips.length / 5));
  const currentPage = Math.min(page, pages - 1);
  React.useEffect(() => { view.current.setPowerPage(currentPage); });
  React.useEffect(() => { setInfo(null); if (!G.board) setPage(0); }, [G.phase]);
  const chip = chips.find(ch => ch.key === info);
  let description = chip ? chip.def.desc(chip.pick) : '';
  if (chip?.def.id === 'fillup') description += ` — ${G.run.fillCount - CONFIG.FILL_UP_THRESHOLD * G.run.fillTriggers}/${CONFIG.FILL_UP_THRESHOLD}`;
  if (chip && ['xtramove', 'momentum'].includes(chip.def.id)) description += ` — ${G.run.momentum || 0}/${G.momentumNeed()}`;
  const playing = G.board && !['menu', 'win', 'loss'].includes(G.phase);
  return h`<div className=${'canvas-game phase-' + G.phase + (G.board ? ' has-board' : '')}>
    <canvas id="game" ref=${ref} tabIndex="0" role="img"
      aria-label=${G.board ? `Match-3 board. Score ${G.score}. Target ${G.nextTarget()}. ${G.movesLeft} moves. Multiplier ${G.run.multiplier}. Drag a piece and release over a neighbouring tile to swap.` : 'Multiplier'}
      onPointerDown=${e => view.current.down(e)} onPointerMove=${e => view.current.move(e)}
      onPointerUp=${e => view.current.up(e)} onPointerCancel=${() => view.current.cancel()} />
    ${playing ? h`<div className="canvas-controls">
      ${chips.slice(currentPage * 5, currentPage * 5 + 5).map((ch, i) => h`<button key=${ch.key}
        className=${'power-hit' + (info === ch.key ? ' active' : '')}
        style=${{ left: (104 + i * 152) / 941 * 100 + '%' }}
        aria-label=${ch.def.name + (ch.pick.color !== undefined ? ' — ' + COLOR_NAMES[ch.pick.color] : '') + (ch.count > 1 ? ' ×' + ch.count : '')}
        aria-pressed=${info === ch.key} title=${ch.def.desc(ch.pick)}
        onClick=${() => setInfo(info === ch.key ? null : ch.key)} />`)}
      ${pages > 1 ? h`<div className="power-pages">
        <button aria-label="Previous power-ups" disabled=${currentPage === 0} onClick=${() => { setPage(currentPage - 1); setInfo(null); }}>‹</button>
        <span>${currentPage + 1} / ${pages}</span>
        <button aria-label="Next power-ups" disabled=${currentPage === pages - 1} onClick=${() => { setPage(currentPage + 1); setInfo(null); }}>›</button>
      </div>` : null}
      ${chip ? h`<div className="power-info" role="status"><b>${chip.def.name}</b><p>${description}</p></div>` : null}
      ${G.fast ? h`<button className="canvas-fast" onClick=${() => { G.fast = false; G.render(); }}>⏩</button>` : null}
    </div>` : null}
    <div className="canvas-ui">
      ${G.phase === 'menu' ? h`<${MenuScreen} G=${G} swapHint="Drag a piece and release over a neighbouring tile to swap." />`
        : G.phase === 'draft' && !G.board ? h`<${DraftScreen} G=${G} />`
        : G.phase === 'win' || G.phase === 'loss' ? h`<${EndScreen} G=${G} />`
        : h`<${LevelChoices} G=${G} />`}
    </div>
  </div>`;
}
window.MultiplierCanvas = MultiplierCanvas;
document.fonts.load('120px Anton');
document.fonts.load('120px Bungee');
background();
