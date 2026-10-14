import { AutomationWorkspace } from "@/components/automation-workspace";
import {
  automationState,
  type AutomationState,
} from "@/lib/server/automation/store";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  let state: AutomationState | null = null;
  try {
    state = await automationState();
  } catch {
    /* Database availability is shown below. */
  }
  if (!state)
    return (
      <div className="empty-state panel" role="alert">
        <h1>Draft automation is unavailable.</h1>
        <p>
          Start the project database and refresh to load your profiles and runs.
        </p>
      </div>
    );
  return <AutomationWorkspace initial={state} />;
}
