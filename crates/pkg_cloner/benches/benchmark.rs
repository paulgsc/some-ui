use criterion::{criterion_group, criterion_main, Criterion};
use pkg_cloner::{copy_configs, find_packages};
use std::fs::{self, File};
use std::hint::black_box;
use std::io::Write;
use tempfile::tempdir;

/// Config filenames recognised by `find_config_files`. `package.json` is the
/// one that goes through `update_package_json`, so it must hold valid JSON.
const CONFIG_FILES: [&str; 5] = ["tsconfig.json", "package.json", "rollup.config.js", ".eslintrc", "jest.config.js"];

fn benchmark_find_packages(c: &mut Criterion) {
	c.bench_function("find_packages", |b| {
		let workspaces_dir = tempdir().unwrap();
		let workspaces = workspaces_dir.path();

		for i in 0..3 {
			let package_path = workspaces.join(format!("package_{i}"));
			fs::create_dir_all(&package_path).unwrap();
		}

		b.iter(|| black_box(find_packages(black_box(workspaces))));
	});
}

fn benchmark_copy_configs(c: &mut Criterion) {
	c.bench_function("copy_configs", |b| {
		let template_dir = tempdir().unwrap();
		let new_package_dir = tempdir().unwrap();
		let template_package = template_dir.path();
		let new_package_path = new_package_dir.path();

		for filename in CONFIG_FILES {
			let mut file = File::create(template_package.join(filename)).unwrap();
			write!(file, "{{}}").unwrap();
		}

		b.iter(|| black_box(copy_configs(black_box(template_package), black_box(new_package_path), "new_package_name")));
	});
}

criterion_group!(benches, benchmark_find_packages, benchmark_copy_configs);

criterion_main!(benches);
