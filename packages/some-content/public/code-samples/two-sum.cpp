#include <unordered_map>
#include <vector>

// Two Sum
//
// Given a vector of integers `nums` and a `target`, return the indices of
// the two numbers that add up to `target`.
//
// A single pass fills `seen` while checking, at each index, whether this
// number's complement has already been visited - no second pass needed.
std::vector<int> twoSum(const std::vector<int>& nums, int target) {
  std::unordered_map<int, int> seen;

  for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
    int complement = target - nums[i];
    auto match = seen.find(complement);
    if (match != seen.end()) {
      return {match->second, i};
    }
    seen[nums[i]] = i;
  }

  return {};
}
