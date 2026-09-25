import { runTests } from './progressCalculator.test';

const { passed, failed } = runTests();
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
