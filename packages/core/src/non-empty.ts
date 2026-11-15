/** `value`, or undefined when it is unset or empty, so `??` can fall back past an empty variable. */
export function nonEmpty(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}
