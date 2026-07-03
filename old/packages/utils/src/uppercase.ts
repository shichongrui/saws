export const uppercase = (text: string) => {
  const [first, ...rest] = text;
  return first.toUpperCase() + rest.join("");
};
