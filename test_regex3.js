const html1 = '**Line 1\nLine 2**';
const html2 = '**bold 1**\nnormal\n**bold 2**';
const html3 = '**unclosed\nnormal\n**closed**';

const regex = /\*\*([\s\S]*?)\*\*/g;
console.log('1:', html1.replace(regex, '<strong>$1</strong>'));
console.log('2:', html2.replace(regex, '<strong>$1</strong>'));
console.log('3:', html3.replace(regex, '<strong>$1</strong>'));
