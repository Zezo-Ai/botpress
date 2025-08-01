import * as sdk from '@botpress/sdk'
import hitl from './bp_modules/hitl'

export const DEFAULT_HITL_HANDOFF_MESSAGE =
  'I have escalated this conversation to a human agent. They should be with you shortly.'
export const DEFAULT_HUMAN_AGENT_ASSIGNED_MESSAGE = 'A human agent has joined the conversation.'
export const DEFAULT_HITL_STOPPED_MESSAGE = 'The human agent closed the conversation. I will continue assisting you.'
export const DEFAULT_USER_HITL_CANCELLED_MESSAGE = '( The user has ended the session. )'
export const DEFAULT_INCOMPATIBLE_MSGTYPE_MESSAGE =
  'Sorry, the user can not receive this type of message. Please resend your message as a text message.'
export const DEFAULT_USER_HITL_CLOSE_COMMAND = '/end'
export const DEFAULT_USER_HITL_COMMAND_MESSAGE =
  'You have ended the session with the human agent. I will continue assisting you.'
export const DEFAULT_AGENT_ASSIGNED_TIMEOUT_MESSAGE =
  'No human agent is available at the moment. Please try again later. I will continue assisting you for the time being.'

const PLUGIN_CONFIG_SCHEMA = sdk.z.object({
  onHitlHandoffMessage: sdk.z
    .string()
    .title('Escalation Started Message')
    .describe('The message to send to the user when transferring to a human agent')
    .optional()
    .placeholder(DEFAULT_HITL_HANDOFF_MESSAGE),
  onHumanAgentAssignedMessage: sdk.z
    .string()
    .title('Human Agent Assigned Message')
    .describe('The message to send to the user when a human agent is assigned')
    .optional()
    .placeholder(DEFAULT_HUMAN_AGENT_ASSIGNED_MESSAGE),
  onHitlStoppedMessage: sdk.z
    .string()
    .title('Escalation Terminated Message')
    .describe('The message to send to the user when the HITL session stops and control is transferred back to bot')
    .optional()
    .placeholder(DEFAULT_HITL_STOPPED_MESSAGE),
  onUserHitlCancelledMessage: sdk.z
    .string()
    .title('Escalation Aborted Message')
    .describe('The message to send to the human agent when the user abruptly ends the HITL session')
    .optional()
    .placeholder(DEFAULT_USER_HITL_CANCELLED_MESSAGE),
  onIncompatibleMsgTypeMessage: sdk.z
    .string()
    .title('Incompatible Message Type Warning')
    .describe(
      'The warning to send to the human agent when they send a message that is not supported by the hitl session'
    )
    .optional()
    .placeholder(DEFAULT_INCOMPATIBLE_MSGTYPE_MESSAGE),
  userHitlCloseCommand: sdk.z
    .string()
    .title('Termination Command')
    .describe(
      'Users may send this command to end the HITL session at any time. It is case-insensitive, so it works regardless of letter casing.'
    )
    .optional()
    .placeholder(DEFAULT_USER_HITL_CLOSE_COMMAND),
  onUserHitlCloseMessage: sdk.z
    .string()
    .title('Termination Command Message')
    .describe('The message to send to the user when they end the HITL session using the termination command')
    .optional()
    .placeholder(DEFAULT_USER_HITL_COMMAND_MESSAGE),
  onAgentAssignedTimeoutMessage: sdk.z
    .string()
    .title('Agent Assigned Timeout Message')
    .describe('The message to send to the user when no human agent is assigned within the timeout period')
    .optional()
    .placeholder(DEFAULT_AGENT_ASSIGNED_TIMEOUT_MESSAGE),
  agentAssignedTimeoutSeconds: sdk.z
    .number()
    .title('Agent Assigned Timeout')
    .describe(
      'The time in seconds to wait before giving up and telling the user that no human agent is available. Set to 0 to disable'
    )
    .nonnegative()
    .optional()
    .placeholder('0'),
  flowOnHitlStopped: sdk.z
    .boolean()
    .default(true)
    .title('Continue Flow on Session End?')
    .describe('Enable this to continue the flow when the HITL session ends. Otherwise, the flow waits for user input.'),
})

export default new sdk.PluginDefinition({
  name: 'hitl',
  version: '0.13.2',
  title: 'Human In The Loop',
  description: 'Seamlessly transfer conversations to human agents',
  icon: 'icon.svg',
  readme: 'hub.md',
  configuration: {
    schema: PLUGIN_CONFIG_SCHEMA,
  },
  actions: {
    startHitl: {
      title: 'Start HITL',
      description: 'Starts the HITL mode',
      input: {
        schema: ({ entities }) =>
          sdk.z
            .object({
              title: sdk.z.string().title('Ticket Title').describe('Title of the HITL ticket'),
              description: sdk.z
                .string()
                .title('Ticket Description')
                .optional()
                .describe('Description of the HITL ticket'),
              hitlSession: entities.hitl.hitlSession
                .optional()
                .title('Extra configuration')
                .describe('Configuration of the HITL session'),
              userId: sdk.z
                .string()
                .title('User ID')
                .describe('ID of the user that starts the HITL mode')
                .placeholder('{{ event.userId }}'),
              userEmail: sdk.z
                .string()
                .title('User Email')
                .optional()
                .describe(
                  'Email of the user that starts the HITL mode. If this value is unset, the agent will try to use the email provided by the channel.'
                ),
              conversationId: sdk.z
                .string()
                .title('Conversation ID') // this is the upstream conversation
                .describe('ID of the conversation on which to start the HITL mode')
                .placeholder('{{ event.conversationId }}'),
              configurationOverrides: PLUGIN_CONFIG_SCHEMA.partial()
                .optional()
                .title('Configuration Overrides')
                .describe('Use this to override the global configuration for this specific HITL session'),
            })
            .passthrough(),
      },
      output: { schema: sdk.z.object({}) },
    },
    stopHitl: {
      title: 'Stop HITL',
      description: 'Stop the HITL mode',
      input: {
        schema: sdk.z.object({
          conversationId: sdk.z
            .string()
            .describe('ID of the conversation on which to stop the HITL mode')
            .placeholder('{{ event.conversationId }}'),
        }),
      },
      output: { schema: sdk.z.object({}) },
    },
  },
  states: {
    hitl: {
      type: 'conversation',
      schema: sdk.z.object({
        hitlActive: sdk.z.boolean().title('Is HITL Enabled?').describe('Whether the conversation is in HITL mode'),
      }),
    },
    effectiveSessionConfig: {
      type: 'conversation',
      schema: PLUGIN_CONFIG_SCHEMA,
    },
  },
  user: {
    tags: {
      downstream: {
        title: 'Downstream User ID',
        description: 'ID of the downstream user bound to the upstream one',
      },
      upstream: {
        title: 'Upstream User ID',
        description: 'ID of the upstream user bound to the downstream one',
      },
      integrationName: {
        title: 'HITL Integration Name',
        description: 'Name of the integration which created the downstream user',
      },
    },
  },
  conversation: {
    tags: {
      downstream: {
        title: 'Downstream Conversation ID',
        description: 'ID of the downstream conversation bound to the upstream one',
      },
      upstream: {
        title: 'Upstream Conversation ID',
        description: 'ID of the upstream conversation bound to the downstream one',
      },
      humanAgentId: {
        title: 'Human Agent ID',
        description: 'ID of the human agent assigned to the ticket',
      },
      humanAgentName: {
        title: 'Human Agent Name',
        description: 'Name of the human agent assigned to the ticket',
      },
      hitlEndReason: {
        title: 'HITL End Reason',
        description: 'Reason why the HITL session ended',
      },
      startMessageId: {
        title: 'Start Message ID',
        description: 'ID of the user message that initiated the HITL session',
      },
    },
  },
  interfaces: {
    hitl,
  },
  events: {
    humanAgentAssignedTimeout: {
      schema: sdk.z.object({
        sessionStartedAt: sdk.z
          .string()
          .title('Session Started At')
          .describe('Timestamp of when the HITL session started'),
        downstreamConversationId: sdk.z
          .string()
          .title('Downstream Conversation ID')
          .describe('ID of the downstream conversation'),
      }),
    },
    continueWorkflow: {
      schema: sdk.z.object({
        conversationId: sdk.z.string().title('Upstream Conversation ID').describe('ID of the upstream conversation'),
      }),
    },
  },
})
