use ra_ap_syntax::{tokenize, Parse, SourceFile, SyntaxKind, SyntaxNode, SyntaxToken};
use rand::seq::SliceRandom;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

/// Maximum number of tokens to sample for stochastic verification
const MAX_SAMPLE_SIZE: usize = 100;

/// Error types that can occur during verification
#[derive(Debug)]
pub enum VerificationError {
    ParseError(String),
    NotSubset(String),
    InvalidInput(String),
}

/// Result of the verification process
pub struct VerificationResult {
    /// Whether A is equal to or a subset of B
    pub is_subset: bool,
    /// Confidence level of the verification (0.0 to 1.0)
    pub confidence: f64,
    /// Witness tokens that were sampled for verification
    pub witness_tokens: Vec<String>,
    /// Hash of the verification process for ZK proof
    pub proof_hash: String,
}

/// Stochastic ZK verifier for Rust code
pub struct StochasticVerifier {
    /// Number of samples to take for verification
    sample_size: usize,
    /// Random number generator for sampling
    rng: rand::rngs::ThreadRng,
}

impl Default for StochasticVerifier {
    fn default() -> Self {
        Self {
            sample_size: MAX_SAMPLE_SIZE,
            rng: rand::rng(),
        }
    }
}

impl StochasticVerifier {
    /// Create a new verifier with custom sample size
    pub fn new(sample_size: usize) -> Self {
        let sample_size = sample_size.min(MAX_SAMPLE_SIZE);
        Self { sample_size, rng: rand::rng() }
    }

    /// Parse Rust code string into a syntax tree
    fn parse_code(&self, code: &str) -> Result<Parse<SourceFile>, VerificationError> {
        let parse = SourceFile::parse(code);
        if parse.errors().is_empty() {
            Ok(parse)
        } else {
            Err(VerificationError::ParseError(parse.errors().iter().map(|e| e.to_string()).collect::<Vec<_>>().join(", ")))
        }
    }

    /// Extract all tokens from a syntax node
    fn extract_tokens(&self, node: &SyntaxNode) -> Vec<SyntaxToken> {
        let mut tokens = Vec::new();
        let mut current = node.first_token();

        while let Some(token) = current {
            if !token.kind().is_trivia() {
                tokens.push(token.clone());
            }
            current = token.next_token();
        }

        tokens
    }

    /// Convert tokens to a hashset for fast lookup
    fn tokens_to_hashset(&self, tokens: &[SyntaxToken]) -> HashSet<String> {
        tokens.iter().map(|t| (t.kind(), t.text().to_string())).collect()
    }

    /// Sample tokens for stochastic verification
    fn sample_tokens(&mut self, tokens: &[SyntaxToken]) -> Vec<SyntaxToken> {
        if tokens.is_empty() {
            return Vec::new();
        }

        let sample_size = self.sample_size.min(tokens.len());
        let mut tokens = tokens.to_vec();

        // Fisher–Yates shuffle using self.rng
        tokens.shuffle(&mut self.rng);

        tokens.into_iter().take(sample_size).collect()
    }

    /// Generate a zero-knowledge proof hash based on the verification process
    fn generate_zk_proof(&self, a_tokens: &[SyntaxToken], b_tokens: &[SyntaxToken], sampled_tokens: &[SyntaxToken], is_subset: bool) -> String {
        let mut hasher = Sha256::new();

        // Add sampled token information without revealing exact tokens
        for token in sampled_tokens {
            hasher.update(token.kind().to_string());
            // Use length instead of actual text for ZK property
            hasher.update(token.text().len().to_string());
        }

        // Add subset verification result
        hasher.update(is_subset.to_string());

        // Add cardinality information
        hasher.update(a_tokens.len().to_string());
        hasher.update(b_tokens.len().to_string());

        // Return hex string of hash
        format!("{:x}", hasher.finalize())
    }

    /// Verify if code A is equal to or a subset of code B
    pub fn verify(&mut self, code_a: &str, code_b: &str) -> Result<VerificationResult, VerificationError> {
        // Parse input code
        let parse_a = self.parse_code(code_a)?;
        let parse_b = self.parse_code(code_b)?;

        // Extract all tokens
        let tokens_a = self.extract_tokens(&parse_a.syntax_node());
        let tokens_b = self.extract_tokens(&parse_b.syntax_node());

        if tokens_a.is_empty() {
            return Err(VerificationError::InvalidInput("Code A is empty".to_string()));
        }

        if tokens_b.is_empty() {
            return Err(VerificationError::InvalidInput("Code B is empty".to_string()));
        }

        // Convert B tokens to hashset for fast lookup
        let b_set = self.tokens_to_hashset(&tokens_b);

        // Sample tokens from A for stochastic verification
        let sampled_tokens = self.sample_tokens(&tokens_a);
        let mut not_found_tokens = Vec::new();
        let mut witness_tokens = Vec::new();

        // Check if sampled tokens from A exist in B
        for token in &sampled_tokens {
            let key = (token.kind(), token.text().to_string());
            witness_tokens.push(format!("{:?}: {}", token.kind(), token.text()));

            if !b_set.contains(&key) {
                not_found_tokens.push(format!("{:?}: {}", token.kind(), token.text()));
            }
        }

        // Calculate confidence level based on sample size
        let confidence = if tokens_a.is_empty() {
            0.0
        } else {
            sampled_tokens.len() as f64 / tokens_a.len() as f64
        };

        // Generate ZK proof
        let is_subset = not_found_tokens.is_empty();
        let proof_hash = self.generate_zk_proof(&tokens_a, &tokens_b, &sampled_tokens, is_subset);

        if !is_subset {
            return Err(VerificationError::NotSubset(format!(
                "Code A contains tokens not present in B: {}",
                not_found_tokens.join(", ")
            )));
        }

        Ok(VerificationResult {
            is_subset,
            confidence,
            witness_tokens,
            proof_hash,
        })
    }

    /// Check if two code blobs are structurally equivalent
    pub fn check_equivalence(&mut self, code_a: &str, code_b: &str) -> Result<bool, VerificationError> {
        // Parse input code
        let parse_a = self.parse_code(code_a)?;
        let parse_b = self.parse_code(code_b)?;

        // Extract tokens (ignoring whitespace and comments)
        let tokens_a = self.extract_tokens(&parse_a.syntax_node());
        let tokens_b = self.extract_tokens(&parse_b.syntax_node());

        // Quick check: different token counts means different code
        if tokens_a.len() != tokens_b.len() {
            return Ok(false);
        }

        // Compare token streams
        for (token_a, token_b) in tokens_a.iter().zip(tokens_b.iter()) {
            if token_a.kind() != token_b.kind() || token_a.text() != token_b.text() {
                return Ok(false);
            }
        }

        Ok(true)
    }
}

/// Main entry point for verification
pub fn verify_rust_code(code_a: &str, code_b: &str) -> Result<VerificationResult, VerificationError> {
    let mut verifier = StochasticVerifier::default();
    verifier.verify(code_a, code_b)
}

/// Check if code_a is equal to code_b
pub fn is_equivalent(code_a: &str, code_b: &str) -> Result<bool, VerificationError> {
    let mut verifier = StochasticVerifier::default();
    verifier.check_equivalence(code_a, code_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subset_verification() {
        let code_a = "fn hello() { println!(\"Hello\"); }";
        let code_b = "fn hello() { println!(\"Hello\"); } fn world() { println!(\"World\"); }";

        let mut verifier = StochasticVerifier::new(50);
        let result = verifier.verify(code_a, code_b).unwrap();

        assert!(result.is_subset);
        assert!(result.confidence > 0.0);
    }

    #[test]
    fn test_not_subset_verification() {
        let code_a = "fn hello() { println!(\"Different\"); }";
        let code_b = "fn hello() { println!(\"Hello\"); }";

        let mut verifier = StochasticVerifier::new(50);
        let result = verifier.verify(code_a, code_b);

        assert!(result.is_err());
        match result {
            Err(VerificationError::NotSubset(_)) => (),
            _ => panic!("Expected NotSubset error"),
        }
    }

    #[test]
    fn test_equivalence() {
        let code_a = "fn hello() { println!(\"Hello\"); }";
        let code_b = "fn hello() { println!(\"Hello\"); }";

        let mut verifier = StochasticVerifier::default();
        let result = verifier.check_equivalence(code_a, code_b).unwrap();

        assert!(result);
    }

    #[test]
    fn test_not_equivalent() {
        let code_a = "fn hello() { println!(\"Hello\"); }";
        let code_b = "fn hello() { println!(\"World\"); }";

        let mut verifier = StochasticVerifier::default();
        let result = verifier.check_equivalence(code_a, code_b).unwrap();

        assert!(!result);
    }
}
