import * as client from '@botpress/client'
import {
  DEFAULT_INCOMPATIBLE_MSGTYPE_MESSAGE,
  DEFAULT_USER_HITL_CANCELLED_MESSAGE,
  DEFAULT_USER_HITL_CLOSE_COMMAND,
  DEFAULT_USER_HITL_COMMAND_MESSAGE,
} from 'plugin.definition'
import { tryLinkWebchatUser } from 'src/webchat'
import * as configuration from '../../configuration'
import * as conv from '../../conv-manager'
import type * as types from '../../types'
import * as consts from '../consts'
import * as bp from '.botpress'

export const handleMessage: bp.HookHandlers['before_incoming_message']['*'] = async (props) => {
  const { conversation } = await props.client.getConversation({
    id: props.data.conversationId,
  })
  const { integration } = conversation
  if (integration === props.interfaces.hitl.name) {
    return await _handleDownstreamMessage(props, conversation)
  }
  return await _handleUpstreamMessage(props, conversation)
}

const _handleDownstreamMessage = async (
  props: bp.HookHandlerProps['before_incoming_message'],
  downstreamConversation: client.Conversation
) => {
  const downstreamCm = conv.ConversationManager.from(props, props.data.conversationId)
  const isHitlActive = await downstreamCm.isHitlActive()
  if (!isHitlActive) {
    return consts.STOP_EVENT_HANDLING // we don't want the bot to chat with the human agent in a closed ticket
  }

  const downstreamUserId = props.data.userId
  const upstreamConversationId = downstreamConversation.tags['upstream']

  if (!upstreamConversationId) {
    return await _abortHitlSession({
      cm: downstreamCm,
      internalReason: 'Downstream conversation was not bound to upstream conversation',
      reasonShownToUser: 'Something went wrong, you are not connected to a human agent...',
      props,
    })
  }

  const sessionConfig = await configuration.retrieveSessionConfig({
    ...props,
    upstreamConversationId,
  })

  const messagePayload = _getMessagePayloadIfSupported(props.data)

  if (!messagePayload) {
    props.logger.with(props.data).error('Downstream conversation received a non-text message')
    await downstreamCm.respond({
      type: 'text',
      text: sessionConfig.onIncompatibleMsgTypeMessage?.length
        ? sessionConfig.onIncompatibleMsgTypeMessage
        : DEFAULT_INCOMPATIBLE_MSGTYPE_MESSAGE,
    })
    return consts.STOP_EVENT_HANDLING
  }

  const upstreamCm = conv.ConversationManager.from(props, upstreamConversationId)

  props.logger.withConversationId(downstreamConversation.id).info('Sending message to upstream')

  const upstreamUserId = await tryLinkWebchatUser(props, { downstreamUserId, upstreamConversationId })
  await upstreamCm.respond({ ...messagePayload, userId: upstreamUserId })
  return consts.STOP_EVENT_HANDLING
}

const _getMessagePayloadIfSupported = (msg: client.Message): types.MessagePayload | undefined =>
  consts.SUPPORTED_MESSAGE_TYPES.includes(msg.type as types.SupportedMessageTypes)
    ? ({ type: msg.type, ...msg.payload } as types.MessagePayload)
    : undefined

const _handleUpstreamMessage = async (
  props: bp.HookHandlerProps['before_incoming_message'],
  upstreamConversation: client.Conversation
) => {
  const upstreamCm = conv.ConversationManager.from(props, props.data.conversationId)
  const isHitlActive = await upstreamCm.isHitlActive()
  if (!isHitlActive) {
    return consts.LET_BOT_HANDLE_EVENT
  }

  const sessionConfig = await configuration.retrieveSessionConfig({
    ...props,
    upstreamConversationId: upstreamCm.conversationId,
  })

  const messagePayload = _getMessagePayloadIfSupported(props.data)

  if (!messagePayload) {
    props.logger.with(props.data).error('Upstream conversation received a non-text message')
    await upstreamCm.respond({
      type: 'text',
      text: 'Sorry, I can only handle text messages for now. Please try again.',
    })
    return consts.STOP_EVENT_HANDLING
  }

  const { user: patientUpstreamUser } = await props.client.getUser({ id: props.data.userId })

  const downstreamConversationId = upstreamConversation.tags['downstream']
  if (!downstreamConversationId) {
    return await _abortHitlSession({
      cm: upstreamCm,
      internalReason: 'Upstream conversation was not bound to downstream conversation',
      reasonShownToUser: 'Something went wrong, you are not connected to a human agent...',
      props,
    })
  }

  const patientDownstreamUserId = patientUpstreamUser.tags['downstream']
  if (!patientDownstreamUserId) {
    return await _abortHitlSession({
      cm: upstreamCm,
      internalReason: 'Upstream user was not bound to downstream user',
      reasonShownToUser: 'Something went wrong, you are not connected to a human agent...',
      props,
    })
  }

  const downstreamCm = conv.ConversationManager.from(props, downstreamConversationId)

  if (_isHitlCloseCommand(props, sessionConfig)) {
    await _handleHitlCloseCommand(props, { downstreamCm, upstreamCm, sessionConfig })

    if (sessionConfig.flowOnHitlStopped) {
      // the bot will continue the conversation without the patient having to send another message
      await upstreamCm.continueWorkflow()
    }

    return consts.STOP_EVENT_HANDLING
  }

  props.logger.withConversationId(upstreamConversation.id).info('Sending message to downstream')
  await downstreamCm.respond({ ...messagePayload, userId: patientDownstreamUserId })

  return consts.STOP_EVENT_HANDLING
}

const _abortHitlSession = async ({
  cm,
  internalReason,
  reasonShownToUser,
  props,
}: {
  cm: conv.ConversationManager
  internalReason: string
  reasonShownToUser: string
  props: bp.HookHandlerProps['before_incoming_message']
}) => {
  props.logger.withConversationId(cm.conversationId).error(internalReason)

  await cm.abortHitlSession(reasonShownToUser)

  return consts.STOP_EVENT_HANDLING
}

const _isHitlCloseCommand = (
  props: bp.HookHandlerProps['before_incoming_message'],
  sessionConfig: bp.configuration.Configuration
) => {
  const closeCommand = sessionConfig.userHitlCloseCommand?.length
    ? sessionConfig.userHitlCloseCommand
    : DEFAULT_USER_HITL_CLOSE_COMMAND

  const inputText: string | undefined = props.data.payload.text
  return inputText && inputText.trim().toLowerCase() === closeCommand.trim().toLowerCase()
}

const _handleHitlCloseCommand = async (
  props: bp.HookHandlerProps['before_incoming_message'],
  {
    downstreamCm,
    upstreamCm,
    sessionConfig,
  }: {
    downstreamCm: conv.ConversationManager
    upstreamCm: conv.ConversationManager
    sessionConfig: bp.configuration.Configuration
  }
) => {
  await downstreamCm.respond({
    type: 'text',
    text: sessionConfig.onUserHitlCancelledMessage?.length
      ? sessionConfig.onUserHitlCancelledMessage
      : DEFAULT_USER_HITL_CANCELLED_MESSAGE,
  })

  await Promise.allSettled([
    upstreamCm.setHitlInactive(conv.HITL_END_REASON.PATIENT_USED_TERMINATION_COMMAND),
    downstreamCm.setHitlInactive(conv.HITL_END_REASON.PATIENT_USED_TERMINATION_COMMAND),
  ])

  props.logger
    .withConversationId(upstreamCm.conversationId)
    .info('User ended the HITL session using the termination command')
  props.logger
    .withConversationId(downstreamCm.conversationId)
    .info('User ended the HITL session using the termination command')

  // Call stopHitl in the hitl integration (zendesk, etc.):
  await props.actions.hitl.stopHitl({ conversationId: downstreamCm.conversationId })

  await upstreamCm.respond({
    type: 'text',
    text: sessionConfig.onUserHitlCloseMessage?.length
      ? sessionConfig.onUserHitlCloseMessage
      : DEFAULT_USER_HITL_COMMAND_MESSAGE,
  })
}
