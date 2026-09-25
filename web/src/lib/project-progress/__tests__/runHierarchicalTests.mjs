import assert from 'node:assert';
import {
  buildAndCalculateProgressTree,
  calculateTreeProjectProgress,
  getAllocationStatus,
} from '../treeCalculator.js';
import { toggleItemCompletion, computeItemProjectContribution } from '../itemCalculator.js';

console.log('=== RUNNING HIERARCHICAL PROJECT PROGRESS TESTS ===\n');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// Test 1: Leaf Node
it('1. Leaf Node with manual 50% progress', () => {
  const rawNodes = [
    { id: 'cat-1', parentId: null, name: 'Planung', weight: 20, nodeType: 'CATEGORY' },
    { id: 'work-1', parentId: 'cat-1', name: 'Vorbereitung', weight: 100, progress: 50, nodeType: 'WORK_ITEM' },
  ];
  const tree = buildAndCalculateProgressTree(rawNodes);
  assert.strictEqual(tree.length, 1);
  assert.strictEqual(tree[0].children[0].progress, 50);
  assert.strictEqual(tree[0].children[0].contributionToProject, 10);
  assert.strictEqual(tree[0].progress, 50);
  assert.strictEqual(tree[0].contributionToProject, 10);
});

// Test 2: Checkbox
it('2. Checkbox toggles 0% -> 100% and 100% -> 0%', () => {
  assert.strictEqual(toggleItemCompletion(0), 100);
  assert.strictEqual(toggleItemCompletion(50), 100);
  assert.strictEqual(toggleItemCompletion(100), 0);
});

// Test 3: Parent Node with 4 children
it('3. Parent progress computed from children equals 37.5%', () => {
  const rawNodes = [
    { id: 'cat-1', parentId: null, name: 'Endmontage', weight: 10, nodeType: 'CATEGORY' },
    { id: 'work-1', parentId: 'cat-1', name: 'Mängelbeseitigung', weight: 10, progress: 0, nodeType: 'WORK_ITEM' },
    { id: 'sub-1', parentId: 'work-1', name: 'Steckdosen korrigieren', weight: 25, progress: 100 },
    { id: 'sub-2', parentId: 'work-1', name: 'Beleuchtung nacharbeiten', weight: 25, progress: 50 },
    { id: 'sub-3', parentId: 'work-1', name: 'Leitungen prüfen', weight: 25, progress: 0 },
    { id: 'sub-4', parentId: 'work-1', name: 'Sonstige Nacharbeiten', weight: 25, progress: 0 },
  ];
  const tree = buildAndCalculateProgressTree(rawNodes);
  const work = tree[0].children[0];
  assert.strictEqual(work.isLeaf, false);
  assert.strictEqual(work.progress, 37.5);
  assert.strictEqual(work.contributionToProject, 0.38);
});

// Test 4: Project contribution
it('4. Category 20%, Child 30%, Progress 50% => Contribution = 3%', () => {
  const contrib = computeItemProjectContribution(20, 30, 50);
  assert.strictEqual(contrib, 3.0);
});

// Test 5: N-Level recursive tree
it('5. N-level deep recursive contribution (Project -> Cat 20% -> Work 30% -> Subwork 50% -> Sub-subwork 100%)', () => {
  const rawNodes = [
    { id: 'l1', parentId: null, name: 'Category 1', weight: 20 },
    { id: 'l2', parentId: 'l1', name: 'Work 1', weight: 30 },
    { id: 'l3', parentId: 'l2', name: 'Subwork 1', weight: 50 },
    { id: 'l4', parentId: 'l3', name: 'Sub-subwork 1', weight: 100, progress: 100 },
  ];
  const tree = buildAndCalculateProgressTree(rawNodes);
  const l1 = tree[0];
  const l2 = l1.children[0];
  const l3 = l2.children[0];
  const l4 = l3.children[0];
  assert.strictEqual(l4.progress, 100);
  assert.strictEqual(l3.progress, 100);
  assert.strictEqual(l2.progress, 50);
  assert.strictEqual(l1.progress, 15);
  assert.strictEqual(l4.contributionToProject, 3.0);
});

// Test 6: Weight < 100%
it('6. Weight < 100% generates UNDER_ALLOCATED status without auto-normalization', () => {
  assert.strictEqual(getAllocationStatus(95), 'UNDER_ALLOCATED');
  const overview = calculateTreeProjectProgress({
    projectId: 'p1',
    rawNodes: [
      { id: 'c1', parentId: null, name: 'Cat 1', weight: 70 },
      { id: 'c2', parentId: null, name: 'Cat 2', weight: 20 },
      { id: 'c3', parentId: null, name: 'Cat 3', weight: 5 },
    ],
  });
  assert.strictEqual(overview.projectAllocation, 95);
  assert.strictEqual(overview.projectAllocationStatus, 'UNDER_ALLOCATED');
  assert.strictEqual(overview.explanation.includes('nicht vollständig verteilt'), true);
});

// Test 7: Weight > 100%
it('7. Weight > 100% generates OVER_ALLOCATED status without auto-normalization', () => {
  assert.strictEqual(getAllocationStatus(110), 'OVER_ALLOCATED');
  const overview = calculateTreeProjectProgress({
    projectId: 'p1',
    rawNodes: [
      { id: 'c1', parentId: null, name: 'Cat 1', weight: 70 },
      { id: 'c2', parentId: null, name: 'Cat 2', weight: 40 },
    ],
  });
  assert.strictEqual(overview.projectAllocation, 110);
  assert.strictEqual(overview.projectAllocationStatus, 'OVER_ALLOCATED');
  assert.strictEqual(overview.explanation.includes('überschreitet 100%'), true);
});

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
