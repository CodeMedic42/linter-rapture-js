const a = () => {}
const b = () => {}

const t = {
    [a]: "Foo",
    [b]: "Bar"
};

console.log(`A: ${t[a]}`);
console.log(`B: ${t[b]}`);

console.log(a.toString());
console.log(b.toString());
