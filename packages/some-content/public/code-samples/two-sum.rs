use std::collections::HashMap;

/// Two Sum
///
/// Given a slice of integers `nums` and a `target`, return the indices of
/// the two numbers that add up to `target`.
///
/// A single pass fills `seen` while checking, at each index, whether this
/// number's complement has already been visited - no second pass needed.
pub fn two_sum(nums: &[i32], target: i32) -> Option<(usize, usize)> {
    let mut seen: HashMap<i32, usize> = HashMap::new();

    for (i, &num) in nums.iter().enumerate() {
        let complement = target - num;
        if let Some(&j) = seen.get(&complement) {
            return Some((j, i));
        }
        seen.insert(num, i);
    }

    None
}
