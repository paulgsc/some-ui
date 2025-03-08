
use once_cell::sync::Lazy;
use regex::Regex;

static RE_NUMBER: Lazy<Regex> = Lazy::new(|| {
	    Regex::new(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?").unwrap()
});

fn zero(b: String) -> impl Fn() -> String {
	    move || b.clone()
}

fn one(b: impl Fn(f64) -> f64 + 'static) -> impl Fn(f64) -> String {
	    move |t| b(t).to_string()
}

fn interpolate_number(a: f64, b: f64) -> impl Fn(f64) -> f64 {
	    move |t| a * (1.0 - t) + b * t
}

fn interpolate(a: &str, b: &str) -> Box<dyn Fn(f64) -> String> {
	    let mut bi = 0; // scan index for next number in b
		    let mut s: Vec<Option<String>> = Vec::new(); // string constants and placeholders
			    let mut q = Vec::new(); // number interpolators
				    let mut i = -1;

					    let mut a_matches = RE_NUMBER.find_iter(a);
						    let mut b_matches = RE_NUMBER.find_iter(b);

							    while let (Some(am), Some(bm)) = (a_matches.next(), b_matches.next()) {
									        if bm.start() > bi {
												            let bs = &b[bi..bm.start()];
															            if let Some(last) = s.last_mut() {
																			                last.as_mut().map(|v| v.push_str(bs));
																							            } else {
																											                s.push(Some(bs.to_string()));
																															                i += 1;
																																			            }
																		        }
											        
											        let am_str = am.as_str();
													        let bm_str = bm.as_str();
															        
															        if am_str == bm_str {
																		            if let Some(last) = s.last_mut() {
																						                last.as_mut().map(|v| v.push_str(bm_str));
																										            } else {
																														                s.push(Some(bm_str.to_string()));
																																		                i += 1;
																																						            }
																					        } else {
																								            s.push(None);
																											            q.push((i as usize, interpolate_number(am_str.parse().unwrap(), bm_str.parse().unwrap())));
																														            i += 1;
																																	        }

																	        bi = bm.end();
																			    }

								    if bi < b.len() {
										        let bs = &b[bi..];
												        if let Some(last) = s.last_mut() {
															            last.as_mut().map(|v| v.push_str(bs));
																		        } else {
																					            s.push(Some(bs.to_string()));
																								        }
														    }

									    if s.len() < 2 {
											        if let Some((_, interp)) = q.first() {
														            Box::new(one(interp.clone()))
																		        } else {
																					            Box::new(zero(b.to_string()))
																									        }
													    } else {
															        Box::new(move |t| {
																		            let mut s_cloned = s.clone();
																					            for (index, interp) in &q {
																									                s_cloned[*index] = Some(interp(*t).to_string());
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
					        let interp = interpolate("The value is 0.", "The value is 100.");
							        assert_eq!(interp(0.0), "The value is 0.");
									        assert_eq!(interp(0.5), "The value is 50.");
											        assert_eq!(interp(1.0), "The value is 100.");
													    }

				    #[test]
				    fn test_interpolate_no_numbers() {
						        let interp = interpolate("Hello", "World");
								        assert_eq!(interp(0.0), "World");
										        assert_eq!(interp(1.0), "World");
												    }
}

