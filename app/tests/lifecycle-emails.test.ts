import test from "node:test";
import assert from "node:assert/strict";

import {
  firstReportReady,
  onboardingConnectSource,
  trialEndsSoon,
} from "../lib/lifecycle-emails.ts";

test("le nom d'agence est échappé dans le HTML", () => {
  const email = onboardingConnectSource({
    agencyName: '<script>alert("xss")</script>"',
    dashboardUrl: "https://reportly.test/dashboard",
  });

  assert.match(
    email.html,
    /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;&quot;/
  );
  assert.doesNotMatch(email.html, /<script>/);
});

test("le template d'onboarding a un sujet et son URL de CTA", () => {
  const dashboardUrl = "https://reportly.test/dashboard";
  const email = onboardingConnectSource({
    agencyName: "Agence Test",
    dashboardUrl,
  });

  assert.notEqual(email.subject.trim(), "");
  assert.ok(email.html.includes(dashboardUrl));
});

test("le template de fin d'essai a un sujet et l'URL de CTA fournie", () => {
  const upgradeUrl = "https://reportly.test/upgrade";
  const email = trialEndsSoon({
    agencyName: "Agence Test",
    daysLeft: 3,
    upgradeUrl,
  });

  assert.notEqual(email.subject.trim(), "");
  assert.ok(email.html.includes(upgradeUrl));
});

test("le template de premier rapport a un sujet et l'URL de CTA fournie", () => {
  const portalUrl = "https://reportly.test/portal/account-1";
  const email = firstReportReady({
    agencyName: "Agence Test",
    accountName: "Compte Test",
    portalUrl,
  });

  assert.notEqual(email.subject.trim(), "");
  assert.ok(email.html.includes(portalUrl));
});
