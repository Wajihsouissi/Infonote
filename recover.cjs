const fs = require('fs');
const lines = fs.readFileSync('C:/Users/hadil/.gemini/antigravity/brain/7e5274bd-2d2d-40a3-8c96-9366c85e1133/.system_generated/logs/transcript.jsonl', 'utf-8').split('\n').filter(Boolean);
lines.forEach(l => {
  const obj = JSON.parse(l);
  if (obj.tool_calls) {
    obj.tool_calls.forEach(tc => {
      if (tc.function.name.includes('replace_file_content')) {
        const args = JSON.parse(tc.function.arguments);
        if (args.TargetFile && args.TargetFile.includes('MarketingPage.module.css')) {
          console.log('\n\n--- DESC:', args.Description);
          args.ReplacementChunks.forEach(chunk => {
             console.log(chunk.ReplacementContent);
          });
        }
      }
    });
  }
});
