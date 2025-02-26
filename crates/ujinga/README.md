# Using SSH for Git Dependencies in Cargo

If you're using a private Git repository as a dependency in your Rust project and encounter authentication issues, follow these steps to ensure Cargo can authenticate using SSH.

## **1. Start the SSH Agent**
Cargo may fail to authenticate if the SSH agent is not running. Start it with:

```sh
eval "$(ssh-agent -s)"
```

## **2. Add Your SSH Key**
Add your private SSH key to the agent:

```sh
ssh-add ~/.ssh/id_ed25519
```

If you're using a different key, adjust the path accordingly.

## **3. Verify the SSH Connection**
Test if authentication works:

```sh
ssh -T git@github.com
```

You should see a message like:

```
Hi <your-github-username>! You've successfully authenticated, but GitHub does not provide shell access.
```

## **4. Configure Cargo to Use SSH**
If you are using `https` instead of `ssh` in your `Cargo.toml`, switch it to:

```toml
[dependencies]
file_reader = { git = "ssh://git@github.com:your-username/repository.git", branch = "main" }
```

If Cargo still has issues fetching via SSH, enable Git CLI fetching in Cargo:

```sh
mkdir -p ~/.cargo
echo '[net] git-fetch-with-cli = true' >> ~/.cargo/config.toml
```

## **5. Run Cargo**
Now, try running:

```sh
cargo check
```

This should now authenticate properly and fetch your dependencies.

---

If you still face issues, ensure your SSH config (`~/.ssh/config`) includes:

```
Host github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  PreferredAuthentications publickey
```


