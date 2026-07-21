const tests = [
    '**bold** normal **bold**',
    '**bold *italic* bold**',
    '*italic **bold** italic*',
    '++underline **bold**++'
];

tests.forEach(html => {
    console.log("Original:", html);
    let out = html
        .replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\+\+([^\n]+?)\+\+/g, '<u>$1</u>')
        .replace(/(^|[^*])\*(?!\s)([^\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
    console.log("Result:", out);
});
