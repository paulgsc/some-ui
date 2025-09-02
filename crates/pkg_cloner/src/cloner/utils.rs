/// Finds the closest match for input string among candidates using Levenshtein distance
pub fn find_closest_match<'a>(input: &'a str, candidates: &[&'a str], similarity_threshold: f64) -> Option<&'a str> {
    if candidates.is_empty() {
        return None;
    }

    let input_len = input.chars().count();
    if input_len == 0 {
        return None;
    }

    candidates
        .iter()
        .map(|&candidate| {
            let distance = levenshtein(input, candidate);
            let max_len = input_len.max(candidate.chars().count());
            let similarity = if max_len == 0 { 1.0 } else { 1.0 - (distance as f64 / max_len as f64) };
            (candidate, similarity)
        })
        .filter(|(_, similarity)| *similarity >= similarity_threshold)
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(candidate, _)| candidate)
}

/// Calculates Levenshtein distance between two strings
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut dp = vec![vec![0; b_len + 1]; a_len + 1];

    // Initialize first row and column
    for i in 0..=a_len {
        dp[i][0] = i;
    }
    for j in 0..=b_len {
        dp[0][j] = j;
    }

    // Fill the matrix
    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            dp[i][j] = (dp[i - 1][j] + 1) // Deletion
                .min(dp[i][j - 1] + 1) // Insertion
                .min(dp[i - 1][j - 1] + cost); // Substitution
        }
    }

    dp[a_len][b_len]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein_distance() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("abc", ""), 3);
        assert_eq!(levenshtein("abc", "abc"), 0);
        assert_eq!(levenshtein("a", "b"), 1);
    }

    #[test]
    fn test_find_closest_match() {
        let candidates = vec!["--workspaces", "-w", "--help"];

        assert_eq!(find_closest_match("--workspace", &candidates, 0.75), Some("--workspaces"));

        assert_eq!(find_closest_match("w", &candidates, 0.5), Some("-w"));

        assert_eq!(find_closest_match("xyz", &candidates, 0.75), None);
    }
}
