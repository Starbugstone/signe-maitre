const sources = new Map();

export const analog = { x: 0, y: 0, steering: 0, throttle: 0 };

export function clearAnalog() {
  analog.x = analog.y = analog.steering = analog.throttle = 0;
}

export const held = {
  has(control) {
    return sources.has(control);
  },
  add(control, source) {
    if (!sources.has(control)) sources.set(control, new Set());
    sources.get(control).add(source);
  },
  delete(control, source) {
    if (source === undefined) {
      sources.delete(control);
      return;
    }
    const owners = sources.get(control);
    if (owners?.delete(source) && !owners.size) sources.delete(control);
  },
  clear() {
    sources.clear();
    clearAnalog();
  },
};

function axis(positive, negative, fallback) {
  const plus = held.has(positive), minus = held.has(negative);
  return plus || minus ? Number(plus) - Number(minus) : fallback;
}

export function walkVector() {
  return [axis("right", "left", analog.x), axis("down", "up", analog.y)];
}

export function steeringInput() {
  return axis("right", "left", analog.steering);
}

export function throttleInput() {
  return axis("up", "down", analog.throttle);
}
