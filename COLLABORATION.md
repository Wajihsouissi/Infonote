# Collaboration Guide for Infonote

This project is hosted on GitHub. Here is how you and your friend can work together.

## 1. Getting the Code (For your friend)

Your friend needs to download the code to their computer. This is called "cloning".

1.  Open a terminal (Command Prompt or PowerShell).
2.  Run this command:
    ```bash
    git clone https://github.com/Wajihsouissi/Infonote.git
    cd Infonote
    ```

## 2. Making Changes

When you or your friend want to add a new feature or fix a bug:

1.  **Get the latest updates** before starting:
    ```bash
    git pull origin main
    ```
2.  **Create a new branch** (optional but recommended for big features):
    ```bash
    git checkout -b feature-name
    ```
3.  **Make your changes** in the code files.
4.  **Save your changes**:
    ```bash
    git add .
    git commit -m "Description of what I changed"
    ```

## 3. Sharing Changes

To send your changes to GitHub so the other person can see them:

1.  **Push your code**:
    ```bash
    git push origin main
    ```
    *(If you made a new branch, use `git push origin feature-name`)*

2.  If you used a branch, go to GitHub to open a **Pull Request** to merge it into `main`.

## 4. Resolving Conflicts

If you both edit the same file at the same time, Git might block a push.
1.  Run `git pull` to get the changes.
2.  Git will tell you which files have conflicts.
3.  Open those files, choose which code to keep, and save.
4.  Commit and push again.
