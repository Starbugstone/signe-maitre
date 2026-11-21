const buttons = [
  [0, "job"], [1, "back"], [2, "action"], [3, "car"], [4, "run"], [5, "horn"],
  [8, "map"], [9, "help"], [11, "report"], [12, "up"], [13, "down"], [14, "left"], [15, "right"],
];
const stickDeadZone = 0.22;
const triggerDeadZone = 0.08;

function withDeadZone(value, deadZone) {
  return Math.min(1, Math.max(0, (value - deadZone) / (1 - deadZone)));
}

export function findGamepad(index) {
  try {
    const pads = navigator.getGamepads?.();
    const supported = (pad) => pad?.connected && pad.mapping === "standard";
    return (supported(pads?.[index]) ? pads[index] : pads?.find(supported)) ?? null;
  } catch {
    return null;
  }
}

export function readGamepad(pad) {
  const controls = new Set();
  for (const [index, control] of buttons) if (pad.buttons[index]?.pressed) controls.add(control);

  const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  const length = Math.hypot(x, y);
  const speed = withDeadZone(length, stickDeadZone);
  const scale = length ? speed / length : 0;
  const steering = Math.sign(x) * withDeadZone(Math.abs(x), stickDeadZone);
  const reverse = withDeadZone(pad.buttons[6]?.value ?? 0, triggerDeadZone);
  const accelerate = withDeadZone(pad.buttons[7]?.value ?? 0, triggerDeadZone);

  const padX = Number(controls.has("right")) - Number(controls.has("left"));
  const padY = Number(controls.has("down")) - Number(controls.has("up"));
  const menuX = padX || padY ? padX : x;
  const menuY = padX || padY ? padY : y;
  const direction = Math.abs(menuX) >= Math.abs(menuY) ? menuX : menuY;
  const scroll = pad.axes[3] ?? 0;
  return {
    controls,
    x: x * scale,
    y: y * scale,
    steering,
    throttle: accelerate - reverse,
    stickActive: speed > 0,
    triggersActive: accelerate > 0 || reverse > 0,
    menuStep: Math.abs(direction) >= 0.55 ? Math.sign(direction) : 0,
    menuScroll: Math.sign(scroll) * withDeadZone(Math.abs(scroll), stickDeadZone),
  };
}
