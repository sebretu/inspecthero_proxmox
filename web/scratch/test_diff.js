const { execSync } = require('child_process');

try {
  const diff = execSync('git diff web/src/app/aufmass/[id]/AufmassSessionClient.tsx', { encoding: 'utf8' });
  console.log("=== Git Diff for AufmassSessionClient.tsx ===");
  console.log(diff || "No changes");
} catch (e) {
  console.error("Failed to run git diff:", e.message);
}
