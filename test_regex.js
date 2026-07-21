const html = '**++*text*++**';
console.log(html
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
);

console.log(html
    .replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+([^\n]+?)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)([^\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
);
