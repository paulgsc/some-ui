#include <stdlib.h>

/*
 * Two Sum
 *
 * Given an array of integers `nums` and a `target`, return the indices of
 * the two numbers that add up to `target` via *out_a / *out_b.
 *
 * No hash map in the standard library, so this stays the straightforward
 * O(n^2) scan rather than hand-rolling one just for a typing demo.
 * Returns 1 on success, 0 if no pair sums to target.
 */
int two_sum(const int *nums, int size, int target, int *out_a, int *out_b) {
  for (int i = 0; i < size; i++) {
    for (int j = i + 1; j < size; j++) {
      if (nums[i] + nums[j] == target) {
        *out_a = i;
        *out_b = j;
        return 1;
      }
    }
  }

  return 0;
}
