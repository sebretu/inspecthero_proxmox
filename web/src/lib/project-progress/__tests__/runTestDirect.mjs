// Direct Node.js pure-ESM test for Manual Project Progress mathematical engine

function computeItemProjectContribution(categoryWeight, workWeight, completion) {
  const catW = Math.max(0, categoryWeight);
  const workW = Math.max(0, workWeight);
  const comp = Math.min(100, Math.max(0, completion));
  return Number(((catW * workW * comp) / 10000).toFixed(2));
}

function computeItemCategoryContribution(workWeight, completion) {
  const workW = Math.max(0, workWeight);
  const comp = Math.min(100, Math.max(0, completion));
  return Number(((workW / 100) * comp).toFixed(2));
}

function toggleItemCompletion(currentProgress) {
  return currentProgress >= 100 ? 0 : 100;
}

function calculateCategory(category) {
  const categoryWeight = Math.max(0, category.weight);
  let totalAllocation = 0;
  let rawCategoryProgress = 0;

  const items = (category.items || []).map((item, index) => {
    const itemWeight = Math.max(0, item.weight);
    const itemProgress = Math.min(100, Math.max(0, item.progress));
    
    totalAllocation += itemWeight;
    const contributionToCategory = computeItemCategoryContribution(itemWeight, itemProgress);
    const contributionToProject = computeItemProjectContribution(categoryWeight, itemWeight, itemProgress);
    rawCategoryProgress += (itemWeight / 100) * itemProgress;

    return {
      ...item,
      weight: itemWeight,
      progress: itemProgress,
      contributionToCategory,
      contributionToProject,
    };
  });

  const categoryProgress = Number(rawCategoryProgress.toFixed(2));
  const categoryContribution = Number(((categoryWeight / 100) * rawCategoryProgress).toFixed(2));
  const roundedAllocation = Number(totalAllocation.toFixed(2));

  let allocationStatus = 'BALANCED';
  if (roundedAllocation < 100) allocationStatus = 'UNDER_ALLOCATED';
  else if (roundedAllocation > 100) allocationStatus = 'OVER_ALLOCATED';

  return {
    ...category,
    progress: categoryProgress,
    contribution: categoryContribution,
    allocation: roundedAllocation,
    allocationStatus,
    items,
  };
}

function calculateProjectProgress(input) {
  let totalProjectAllocation = 0;
  let totalProjectProgress = 0;

  const categories = (input.categories || []).map((cat) => {
    const calculatedCat = calculateCategory(cat);
    totalProjectAllocation += calculatedCat.weight;
    totalProjectProgress += calculatedCat.contribution;
    return calculatedCat;
  });

  const roundedProjectProgress = Number(totalProjectProgress.toFixed(2));
  const roundedProjectAllocation = Number(totalProjectAllocation.toFixed(2));

  let projectAllocationStatus = 'BALANCED';
  if (roundedProjectAllocation < 100) projectAllocationStatus = 'UNDER_ALLOCATED';
  else if (roundedProjectAllocation > 100) projectAllocationStatus = 'OVER_ALLOCATED';

  return {
    projectId: input.projectId,
    projectProgress: roundedProjectProgress,
    projectAllocation: roundedProjectAllocation,
    projectAllocationStatus,
    categories,
  };
}

// RUN TESTS
let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${testName}${details ? ` - ${details}` : ''}`);
  }
}

console.log('--- EXECUTING MATHEMATICAL SUITE ---');

// Test 1
assert(computeItemProjectContribution(20, 30, 50) === 3.0, 'Test 1: BMA 20%, Montage 30%, Progress 50% => 3%');

// Test 2
assert(computeItemProjectContribution(20, 30, 100) === 6.0, 'Test 2: BMA 20%, Montage 30%, Progress 100% => 6%');

// Test 3 & 4
const res3 = calculateProjectProgress({
  projectId: 'p1',
  categories: [
    {
      id: 'cat-1',
      name: 'BMA',
      weight: 20,
      items: [
        { id: 'i-1', name: 'Montage', weight: 30, progress: 50 },
        { id: 'i-2', name: 'Kabel', weight: 40, progress: 100 },
        { id: 'i-3', name: 'Prüfung', weight: 30, progress: 0 },
      ],
    },
  ],
});
assert(res3.categories[0].progress === 55.0, 'Test 3: Category Progress calculation (55%)');
assert(res3.categories[0].contribution === 11.0, 'Test 4a: Category Contribution (11%)');
assert(res3.projectProgress === 11.0, 'Test 4b: Project Progress (11%)');

// Test 5: Multiple categories (Total 42%)
const res5 = calculateProjectProgress({
  projectId: 'p5',
  categories: [
    { id: 'c1', name: 'BMA', weight: 20, items: [{ weight: 100, progress: 55 }] },
    { id: 'c2', name: 'Elektro', weight: 30, items: [{ weight: 100, progress: 70 }] },
    { id: 'c3', name: 'Dok', weight: 10, items: [{ weight: 100, progress: 40 }] },
    { id: 'c4', name: 'Abnahme', weight: 40, items: [{ weight: 100, progress: 15 }] },
  ],
});
assert(res5.projectProgress === 42.0, 'Test 5: Multiple categories sum to 42%');
assert(res5.projectAllocation === 100.0, 'Test 5: Allocation is 100%');
assert(res5.projectAllocationStatus === 'BALANCED', 'Test 5: BALANCED status');

// Test 6: 0% execution
const res6 = calculateProjectProgress({
  projectId: 'p6',
  categories: [{ weight: 50, items: [{ weight: 100, progress: 0 }] }],
});
assert(res6.projectProgress === 0.0, 'Test 6: 0% progress');

// Test 7: 100% execution
const res7 = calculateProjectProgress({
  projectId: 'p7',
  categories: [
    { weight: 50, items: [{ weight: 100, progress: 100 }] },
    { weight: 50, items: [{ weight: 100, progress: 100 }] },
  ],
});
assert(res7.projectProgress === 100.0, 'Test 7: 100% progress');

// Test 8: Under-allocated (<100)
const res8 = calculateProjectProgress({
  projectId: 'p8',
  categories: [{ weight: 40, items: [{ weight: 60, progress: 100 }] }],
});
assert(res8.projectAllocationStatus === 'UNDER_ALLOCATED', 'Test 8: Project UNDER_ALLOCATED');
assert(res8.categories[0].allocationStatus === 'UNDER_ALLOCATED', 'Test 8: Category UNDER_ALLOCATED');

// Test 9: Over-allocated (>100)
const res9 = calculateProjectProgress({
  projectId: 'p9',
  categories: [{ weight: 120, items: [{ weight: 110, progress: 50 }] }],
});
assert(res9.projectAllocationStatus === 'OVER_ALLOCATED', 'Test 9: Project OVER_ALLOCATED');
assert(res9.categories[0].allocationStatus === 'OVER_ALLOCATED', 'Test 9: Category OVER_ALLOCATED');

// Test 10: Toggle item completion
assert(toggleItemCompletion(0) === 100, 'Test 10a: Toggle 0% => 100%');
assert(toggleItemCompletion(65) === 100, 'Test 10b: Toggle 65% => 100%');
assert(toggleItemCompletion(100) === 0, 'Test 10c: Toggle 100% => 0%');

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
