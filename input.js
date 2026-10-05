// The trailing camera looks toward +Z: its screen-right axis points toward -X.
// Keep joystick values in screen space so the thumb follows the finger; convert
// only where PC and mobile intent become shared world movement / dodge input.
export function readMovement(keys, stick = { x: 0, z: 0 }) {
  const screenX = stick.x + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const forward = stick.z + (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  return { x: screenX === 0 ? 0 : -screenX, z: forward };
}
