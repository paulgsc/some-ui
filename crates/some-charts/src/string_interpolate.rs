use once_cell::sync::Lazy;
use regex::Regex;

static RE_NUMBER: Lazy<Regex> = Lazy::new(|| Regex::new(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?").unwrap());

fn zero(b: String) -> impl Fn(f64) -> String {
	move |_| b.clone()
}

fn one(b: impl Fn(f64) -> f64 + 'static) -> impl Fn(f64) -> String {
	move |t| b(t).to_string()
}

fn interpolate_number(a: f64, b: f64) -> impl Fn(f64) -> f64 + Clone {
	move |t| a * (1.0 - t) + b * t
}

/// Appends `text` to the last slot if it holds a literal string, otherwise
/// starts a new slot. A `None` slot is a numeric placeholder (see `q` below)
/// and must never be appended to, so literal text following one always
/// starts a fresh slot.
fn push_literal(s: &mut Vec<Option<String>>, text: &str) {
	if text.is_empty() {
		return;
	}
	match s.last_mut() {
		Some(Some(existing)) => existing.push_str(text),
		_ => s.push(Some(text.to_string())),
	}
}

#[must_use]
pub fn interpolate(a: &str, b: &str) -> Box<dyn Fn(f64) -> String> {
	let mut bi = 0; // scan index for next number in b
	let mut s: Vec<Option<String>> = Vec::new(); // string constants and placeholders
	let mut q = Vec::new(); // number interpolators, keyed by their slot index in s

	let mut a_matches = RE_NUMBER.find_iter(a);
	let mut b_matches = RE_NUMBER.find_iter(b);

	while let (Some(am), Some(bm)) = (a_matches.next(), b_matches.next()) {
		if bm.start() > bi {
			push_literal(&mut s, &b[bi..bm.start()]);
		}

		let am_str = am.as_str();
		let bm_str = bm.as_str();

		if am_str == bm_str {
			push_literal(&mut s, bm_str);
		} else {
			s.push(None);
			let index = s.len() - 1;
			q.push((index, interpolate_number(am_str.parse().unwrap(), bm_str.parse().unwrap())));
		}

		bi = bm.end();
	}

	if bi < b.len() {
		push_literal(&mut s, &b[bi..]);
	}

	if s.len() < 2 {
		if let Some((_, interp)) = q.into_iter().next() {
			Box::new(one(interp))
		} else {
			Box::new(zero(b.to_string()))
		}
	} else {
		Box::new(move |t| {
			let mut s_cloned = s.clone();
			for (index, interp) in &q {
				s_cloned[*index] = Some(interp(t).to_string());
			}
			s_cloned.into_iter().flatten().collect::<String>()
		})
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_interpolate_numbers() {
		let interp = interpolate("0", "100");
		assert_eq!(interp(0.0), "0");
		assert_eq!(interp(0.5), "50");
		assert_eq!(interp(1.0), "100");
	}

	#[test]
	fn test_interpolate_mixed_text() {
		// Avoid a number immediately followed by a sentence-ending period:
		// the number regex (deliberately mirroring d3-interpolate's own
		// pattern) can't distinguish a decimal point from a following
		// period, so it gets absorbed into the number token.
		let interp = interpolate("The value is 0 units", "The value is 100 units");
		assert_eq!(interp(0.0), "The value is 0 units");
		assert_eq!(interp(0.5), "The value is 50 units");
		assert_eq!(interp(1.0), "The value is 100 units");
	}

	#[test]
	fn test_interpolate_no_numbers() {
		let interp = interpolate("Hello", "World");
		assert_eq!(interp(0.0), "World");
		assert_eq!(interp(1.0), "World");
	}
}
