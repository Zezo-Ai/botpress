/**
 * Example 10: UI Components and JSX
 *
 * This example demonstrates LLMz's component system for rich UI generation.
 * It shows how to:
 * - Define custom UI components with typed props
 * - Register component renderers for different output formats
 * - Generate JSX code that uses custom components
 * - Combine tools and components for complete workflows
 * - Create reusable UI patterns with examples
 *
 * Key concepts:
 * - Component definition with typed schemas
 * - JSX code generation and execution
 * - Component registration and rendering
 * - Tool + Component integration patterns
 * - Rich UI output formatting
 */

import { Client } from '@botpress/client'
import { z } from '@bpinternal/zui'

import { Component, execute, Tool } from 'llmz'
import chalk from 'chalk'
import { box } from '../utils/box'
import { CLIChat } from '../utils/cli-chat'

// Initialize Botpress client
const client = new Client({
  botId: process.env.BOTPRESS_BOT_ID!,
  token: process.env.BOTPRESS_TOKEN!,
})

// Define a custom UI component for displaying plane tickets
// Components provide structured, reusable UI patterns
const PlaneTicketComponent = new Component({
  name: 'PlaneTicket',
  description: 'A component to display a plane ticket',
  type: 'leaf', // Leaf components don't contain children
  leaf: {
    // Define the props schema with validation
    props: z.object({
      ticketNumber: z.string().describe('The unique ticket number for the plane ticket'),
      from: z.string().describe('The departure city'),
      to: z.string().describe('The destination city'),
      date: z.string().describe('The date of the flight (in YYYY-MM-DD format)'),
      price: z.number().optional().describe('The price of the ticket'),
    }),
  },
  // Provide usage examples to guide the LLM
  examples: [
    {
      name: 'PlaneTicket',
      description: 'A simple plane ticket example',
      code: `<PlaneTicket from="New York" to="Los Angeles" date="2023-10-01" price={299.99} ticketNumber="ABC-0000000" />`,
    },
  ],
})

// Tool for purchasing tickets - generates data for the component
const purchaseTicket = new Tool({
  name: 'purchase_ticket',
  description: 'Purchase a plane ticket',
  input: z.object({
    from: z.string().describe('The departure city'),
    to: z.string().describe('The destination city'),
    date: z.string().describe('The date of the flight (in YYYY-MM-DD format)'),
  }),
  output: z.object({
    price: z.number().describe('The price of the purchased ticket in USD'),
    ticketNumber: z.string().describe('The unique ticket number for the purchased ticket'),
    confirmation: z.string().describe('Confirmation message for the ticket purchase'),
  }),
  async handler({ from, date, to }) {
    // Simulate ticket purchase API call
    return {
      price: 299.99,
      ticketNumber: `TICKET-345633`,
      confirmation: `Ticket from ${from} to ${to} on ${date} purchased successfully!`,
    }
  },
})

const chat = new CLIChat()

// Pre-populate the conversation with a user request
chat.transcript.push({
  role: 'user',
  content: 'I want to purchase a plane ticket from New York to Los Angeles on 2025-10-01.',
})

// Register how the PlaneTicket component should be rendered
// This defines the visual output when the component is used
chat.registerComponent(PlaneTicketComponent, async (message) => {
  const { ticketNumber, from, to, date, price } = message.props

  // Create a visually appealing ticket display
  const ticket = box([
    chalk.white.bold('             ✈️  FLIGHT TICKET'),
    `${chalk.yellow.bold('Ticket Number:')} ${chalk.white(ticketNumber)}`,
    '',
    `${chalk.green.bold('From:')} ${chalk.white(from)}`,
    `${chalk.red.bold('To:')} ${chalk.white(to)}`,
    '',
    `${chalk.magenta.bold('Date:')} ${chalk.white(date)}`,
    `${chalk.cyan.bold('Price:')} ${chalk.white(`$${price?.toFixed(2) || 'N/A'}`)}`,
    '',
    chalk.gray('         Have a safe flight! 🛫'),
  ])

  // Render the ticket to console
  console.log(ticket)
})

// Execute the travel agent workflow
const result = await execute({
  instructions: `You are a travel agent. Help the user purchase a plane ticket. Show them the ticket using the right component.`,
  tools: [purchaseTicket], // Tool for purchasing tickets
  chat, // Chat interface with component registration
  client,
})

// Show the generated JSX code for educational purposes
console.log(`Here's the code generated by the LLMz to print the ticket:`)
console.log(result.iteration?.code)
