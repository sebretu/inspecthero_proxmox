import { calculateProjectProgress } from '../projectCalculator';
import { toggleItemCompletion, computeItemProjectContribution } from '../itemCalculator';

export function runTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      failed++;
      const msg = `  ❌ [FAIL] ${testName}${details ? ` - ${details}` : ''}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  console.log('Running Manual Project Progress Mathematical Tests...\n');

  // Test 1: Category = 20, Work = 30, Completion = 50 => Expected = 3%
  {
    const contr = computeItemProjectContribution(20, 30, 50);
    assert(contr === 3.0, 'Test 1: BMA 20%, Montage 30%, Progress 50% => Contribution 3%', `Got: ${contr}`);
  }

  // Test 2: Category = 20, Work = 30, Completion = 100 => Expected = 6%
  {
    const contr = computeItemProjectContribution(20, 30, 100);
    assert(contr === 6.0, 'Test 2: BMA 20%, Montage 30%, Progress 100% => Contribution 6%', `Got: ${contr}`);
  }

  // Test 3: Work: 30% * 50% + 40% * 100% + 30% * 0% => Category Progress = 55%
  {
    const result = calculateProjectProgress({
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
    const bma = result.categories[0];
    assert(bma.progress === 55.0, 'Test 3: Category Progress calculation (30%*50% + 40%*100% = 55%)', `Got: ${bma.progress}`);
  }

  // Test 4: Category: 20% * 55% => Contribution = 11%
  {
    const result = calculateProjectProgress({
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
    const bma = result.categories[0];
    assert(bma.contribution === 11.0, 'Test 4: Category Contribution (20% * 55% = 11%)', `Got: ${bma.contribution}`);
    assert(result.projectProgress === 11.0, 'Test 4: Project Total Progress equals 11%', `Got: ${result.projectProgress}`);
  }

  // Test 5: Multiple Categories: BMA (20% -> 55% = 11%), Elektro (30% -> 70% = 21%), Dok (10% -> 40% = 4%), Abnahme (40% -> 15% = 6%) => Total = 42%
  {
    const result = calculateProjectProgress({
      projectId: 'p-multi',
      categories: [
        {
          id: 'cat-1',
          name: 'BMA',
          weight: 20,
          items: [{ id: 'i-1', name: 'BMA Work', weight: 100, progress: 55 }],
        },
        {
          id: 'cat-2',
          name: 'Elektro',
          weight: 30,
          items: [{ id: 'i-2', name: 'Elektro Work', weight: 100, progress: 70 }],
        },
        {
          id: 'cat-3',
          name: 'Dokumentation',
          weight: 10,
          items: [{ id: 'i-3', name: 'Dok Work', weight: 100, progress: 40 }],
        },
        {
          id: 'cat-4',
          name: 'Abnahme',
          weight: 40,
          items: [{ id: 'i-4', name: 'Abnahme Work', weight: 100, progress: 15 }],
        },
      ],
    });
    assert(result.projectProgress === 42.0, 'Test 5: Multiple categories sum to 42%', `Got: ${result.projectProgress}`);
    assert(result.projectAllocation === 100.0, 'Test 5: Total project allocation is 100%', `Got: ${result.projectAllocation}`);
    assert(result.projectAllocationStatus === 'BALANCED', 'Test 5: Allocation status is BALANCED', `Got: ${result.projectAllocationStatus}`);
  }

  // Test 6: Zero percent execution
  {
    const result = calculateProjectProgress({
      projectId: 'p-zero',
      categories: [
        {
          id: 'c-1',
          name: 'BMA',
          weight: 50,
          items: [{ id: 'i-1', name: 'Work 1', weight: 100, progress: 0 }],
        },
      ],
    });
    assert(result.projectProgress === 0.0, 'Test 6: 0% completion returns 0% project progress', `Got: ${result.projectProgress}`);
  }

  // Test 7: 100% full project execution
  {
    const result = calculateProjectProgress({
      projectId: 'p-full',
      categories: [
        {
          id: 'c-1',
          name: 'BMA',
          weight: 50,
          items: [{ id: 'i-1', name: 'Work 1', weight: 100, progress: 100 }],
        },
        {
          id: 'c-2',
          name: 'Elektro',
          weight: 50,
          items: [{ id: 'i-2', name: 'Work 2', weight: 100, progress: 100 }],
        },
      ],
    });
    assert(result.projectProgress === 100.0, 'Test 7: 100% completion on all categories returns 100% project progress', `Got: ${result.projectProgress}`);
  }

  // Test 8: Allocation < 100% (Under-allocated warning)
  {
    const result = calculateProjectProgress({
      projectId: 'p-under',
      categories: [
        {
          id: 'c-1',
          name: 'BMA',
          weight: 40,
          items: [{ id: 'i-1', name: 'Work 1', weight: 60, progress: 100 }],
        },
      ],
    });
    assert(result.projectAllocationStatus === 'UNDER_ALLOCATED', 'Test 8: Project allocation < 100% triggers UNDER_ALLOCATED', `Got: ${result.projectAllocationStatus}`);
    assert(result.categories[0].allocationStatus === 'UNDER_ALLOCATED', 'Test 8: Category allocation < 100% triggers UNDER_ALLOCATED', `Got: ${result.categories[0].allocationStatus}`);
  }

  // Test 9: Allocation > 100% (Over-allocated warning)
  {
    const result = calculateProjectProgress({
      projectId: 'p-over',
      categories: [
        {
          id: 'c-1',
          name: 'BMA',
          weight: 120,
          items: [{ id: 'i-1', name: 'Work 1', weight: 110, progress: 50 }],
        },
      ],
    });
    assert(result.projectAllocationStatus === 'OVER_ALLOCATED', 'Test 9: Project allocation > 100% triggers OVER_ALLOCATED', `Got: ${result.projectAllocationStatus}`);
    assert(result.categories[0].allocationStatus === 'OVER_ALLOCATED', 'Test 9: Category allocation > 100% triggers OVER_ALLOCATED', `Got: ${result.categories[0].allocationStatus}`);
  }

  // Test 10: Checkbox toggles (0 -> 100, 65 -> 100, 100 -> 0)
  {
    assert(toggleItemCompletion(0) === 100, 'Test 10a: Toggle 0% => 100%');
    assert(toggleItemCompletion(65) === 100, 'Test 10b: Toggle 65% => 100%');
    assert(toggleItemCompletion(100) === 0, 'Test 10c: Toggle 100% => 0%');
  }

  console.log(`\nTest results: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed, errors };
}
