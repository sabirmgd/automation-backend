import { JiraImproverAgentService } from './agent.service';

// Example usage of the JIRA ticket improver agent
async function testJiraImprover() {
  // Example vague ticket description (like the one from your screenshot)
  const vagueTicket = `Currently in the we show upcoming passes according to some login, the expected behaviour is, when you click on the
upcoming pass in the home page, it should bring you to the correct page number and the actual item number of the
gate pass table. Currently the issue is, once we click in an upcoming pass, our frontend fails to render the exact row
correctly`;

  // You would normally inject ConfigService, but for testing:
  // const service = new JiraImproverAgentService(configService);

  // Example of how the improved ticket would look:
  const exampleOutput = {
    title: "Fix gate pass navigation from home page upcoming passes",
    description: `When users click on an upcoming pass from the home page, the application should navigate to the gate pass table and highlight the specific row for that pass. Currently, the navigation is failing to render the correct row, causing users to lose track of which pass they selected.

Problem: The frontend fails to properly render and highlight the exact row when navigating from the upcoming passes section to the gate pass table.

Context: Users need to quickly locate specific gate passes after clicking them from the home page for efficient workflow.`,
    acceptanceCriteria: [
      {
        criteria: "Clicking an upcoming pass navigates to the correct page in the gate pass table",
        testable: true
      },
      {
        criteria: "The selected gate pass row is highlighted or scrolled into view",
        testable: true
      },
      {
        criteria: "The URL includes the correct page number and row identifier parameters",
        testable: true
      },
      {
        criteria: "Navigation works correctly for passes on any page of the table",
        testable: true
      }
    ],
    technicalDetails: "Likely requires fixing the navigation parameters passed from the home page component to the gate pass table component. May need to implement row highlighting and auto-scroll functionality.",
    scope: "IN SCOPE: Navigation from home page to gate pass table, row highlighting, page navigation. OUT OF SCOPE: Modifications to the gate pass data structure, changes to home page layout",
    priority: "high",
    estimatedEffort: "medium",
    potentialRisks: [
      "Deep linking might affect existing bookmarks",
      "Performance impact if table has many rows"
    ],
    labels: ["bug", "frontend", "navigation", "user-experience"]
  };

  console.log('Original vague ticket:', vagueTicket);
  console.log('\nExample improved ticket structure:', JSON.stringify(exampleOutput, null, 2));
}

// Run the test
testJiraImprover();