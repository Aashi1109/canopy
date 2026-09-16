import type { Page } from "@playwright/test";

export class AuthPage {
  constructor(private readonly page: Page) {}

  async signIn(email: string, password: string, returnTo: string): Promise<void> {
    await this.page.goto(`http://localhost:3000/auth?returnTo=${encodeURIComponent(returnTo)}`);
    await this.page.getByLabel("Email address").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
    await this.page.getByRole("button", { name: "Sign in", exact: true }).click();
    await this.page.waitForURL((url) => url.pathname !== "/auth");
  }
}
