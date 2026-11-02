/**
 * Setup script for Event Ticket collections in Appwrite
 * Run this script to create the necessary collections and attributes for the event ticket system
 */

import { Client, Databases, Storage, Permission, Role, ID } from 'node-appwrite';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Initialize Appwrite client
const client = new Client();
client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
  .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);
const storage = new Storage(client);

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID || '';
const EVENT_TICKETS_COLLECTION_ID = 'event_tickets';
const EVENT_TICKET_TYPES_COLLECTION_ID = 'event_ticket_types';
const EVENT_TICKET_PURCHASES_COLLECTION_ID = 'event_ticket_purchases';
const EVENT_TICKET_ATTACHMENTS_BUCKET_ID = 'event_ticket_attachments';

async function setupEventTicketCollections() {
  try {
    console.log('🎟️ Setting up Event Ticket collections...');

    // Create event_tickets collection (main ticket configuration per event)
    console.log('Creating event_tickets collection...');
    try {
      await databases.createCollection(
        DB_ID,
        EVENT_TICKETS_COLLECTION_ID,
        'Event Tickets',
        [
          Permission.read(Role.users()),
          Permission.create(Role.users()),
          Permission.create(Role.team('admins')),
          Permission.update(Role.users()),
          Permission.update(Role.team('admins')),
          Permission.delete(Role.users()),
          Permission.delete(Role.team('admins'))
        ]
      );
      console.log('✅ Event tickets collection created');
    } catch (error) {
      if (error.code === 409) {
        console.log('⚠️ Event tickets collection already exists');
      } else {
        throw error;
      }
    }

    // Create event_tickets attributes
    const ticketAttributes = [
      { key: 'eventId', type: 'string', size: 50, required: true, description: 'Reference to the tournament/event ID' },
      { key: 'eventTitle', type: 'string', size: 255, required: true, description: 'Event title for display' },
      { key: 'eventSlug', type: 'string', size: 100, required: true, description: 'Event slug for routing' },
      { key: 'isActive', type: 'boolean', required: false, default: true, description: 'Whether ticket sales are active' },
      { key: 'salesStartDate', type: 'datetime', required: false, description: 'When ticket sales open' },
      { key: 'salesEndDate', type: 'datetime', required: false, description: 'When ticket sales close' },
      { key: 'maxTicketsPerUser', type: 'integer', required: false, default: 5, description: 'Maximum tickets a single user can purchase' },
      { key: 'requiresApproval', type: 'boolean', required: false, default: false, description: 'Whether purchases need admin approval' },
      { key: 'currency', type: 'string', size: 10, required: false, default: 'KES', description: 'Currency code' },
      { key: 'taxRate', type: 'double', required: false, default: 0, description: 'Tax rate as percentage (e.g., 16 for 16%)' },
      { key: 'serviceFee', type: 'double', required: false, default: 0, description: 'Service fee amount' },
      { key: 'serviceFeeType', type: 'string', size: 20, required: false, default: 'fixed', description: 'fixed or percentage' },
      { key: 'description', type: 'string', size: 5000, required: false, description: 'Ticket description/terms' },
      { key: 'refundPolicy', type: 'string', size: 5000, required: false, description: 'Refund policy text' },
      { key: 'contactEmail', type: 'string', size: 255, required: false, description: 'Support email for ticket issues' },
      { key: 'totalSold', type: 'integer', required: false, default: 0, description: 'Total tickets sold across all types' },
      { key: 'totalRevenue', type: 'double', required: false, default: 0, description: 'Total revenue generated' }
    ];

    for (const attr of ticketAttributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            DB_ID,
            EVENT_TICKETS_COLLECTION_ID,
            attr.key,
            attr.size,
            attr.required,
            attr.default,
            false
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            DB_ID,
            EVENT_TICKETS_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(
            DB_ID,
            EVENT_TICKETS_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        } else if (attr.type === 'double') {
          await databases.createFloatAttribute(
            DB_ID,
            EVENT_TICKETS_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            DB_ID,
            EVENT_TICKETS_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        }
        console.log(`✅ Created attribute: ${attr.key}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️ Attribute ${attr.key} already exists`);
        } else {
          console.error(`❌ Error creating attribute ${attr.key}:`, error.message);
        }
      }
    }

    // Create event_ticket_types collection (different ticket tiers: VIP, Regular, Early Bird, etc.)
    console.log('Creating event_ticket_types collection...');
    try {
      await databases.createCollection(
        DB_ID,
        EVENT_TICKET_TYPES_COLLECTION_ID,
        'Event Ticket Types',
        [
          Permission.read(Role.users()),
          Permission.create(Role.users()),
          Permission.create(Role.team('admins')),
          Permission.update(Role.users()),
          Permission.update(Role.team('admins')),
          Permission.delete(Role.users()),
          Permission.delete(Role.team('admins'))
        ]
      );
      console.log('✅ Event ticket types collection created');
    } catch (error) {
      if (error.code === 409) {
        console.log('⚠️ Event ticket types collection already exists');
      } else {
        throw error;
      }
    }

    // Create event_ticket_types attributes
    const ticketTypeAttributes = [
      { key: 'eventTicketId', type: 'string', size: 50, required: true, description: 'Reference to parent event_tickets document' },
      { key: 'name', type: 'string', size: 100, required: true, description: 'Ticket type name (e.g., VIP, Regular, Early Bird)' },
      { key: 'description', type: 'string', size: 2000, required: false, description: 'Description of what this ticket includes' },
      { key: 'price', type: 'double', required: true, description: 'Base price of the ticket' },
      { key: 'originalPrice', type: 'double', required: false, default: 0, description: 'Original price for showing discounts' },
      { key: 'quantityTotal', type: 'integer', required: true, description: 'Total available tickets of this type' },
      { key: 'quantitySold', type: 'integer', required: false, default: 0, description: 'Number of tickets sold' },
      { key: 'quantityReserved', type: 'integer', required: false, default: 0, description: 'Number of tickets reserved/pending payment' },
      { key: 'maxPerOrder', type: 'integer', required: false, default: 10, description: 'Max tickets of this type per order' },
      { key: 'minPerOrder', type: 'integer', required: false, default: 1, description: 'Min tickets of this type per order' },
      { key: 'sortOrder', type: 'integer', required: false, default: 0, description: 'Display order' },
      { key: 'isActive', type: 'boolean', required: false, default: true, description: 'Whether this ticket type is available for purchase' },
      { key: 'salesStartDate', type: 'datetime', required: false, description: 'When this ticket type goes on sale' },
      { key: 'salesEndDate', type: 'datetime', required: false, description: 'When this ticket type stops selling' },
      { key: 'benefits', type: 'string', size: 5000, required: false, array: true, description: 'List of benefits included with this ticket' },
      { key: 'color', type: 'string', size: 20, required: false, default: '#8c110d', description: 'Display color for UI' },
      { key: 'isFeatured', type: 'boolean', required: false, default: false, description: 'Whether to highlight this ticket type' }
    ];

    for (const attr of ticketTypeAttributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            DB_ID,
            EVENT_TICKET_TYPES_COLLECTION_ID,
            attr.key,
            attr.size,
            attr.required,
            attr.default,
            attr.array || false
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            DB_ID,
            EVENT_TICKET_TYPES_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(
            DB_ID,
            EVENT_TICKET_TYPES_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        } else if (attr.type === 'double') {
          await databases.createFloatAttribute(
            DB_ID,
            EVENT_TICKET_TYPES_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            DB_ID,
            EVENT_TICKET_TYPES_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        }
        console.log(`✅ Created ticket type attribute: ${attr.key}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️ Ticket type attribute ${attr.key} already exists`);
        } else {
          console.error(`❌ Error creating ticket type attribute ${attr.key}:`, error.message);
        }
      }
    }

    // Create event_ticket_purchases collection (actual purchases by users)
    console.log('Creating event_ticket_purchases collection...');
    try {
      await databases.createCollection(
        DB_ID,
        EVENT_TICKET_PURCHASES_COLLECTION_ID,
        'Event Ticket Purchases',
        [
          Permission.read(Role.team('admins')),
          Permission.create(Role.users()),
          Permission.update(Role.team('admins')),
          Permission.delete(Role.team('admins'))
        ]
      );
      console.log('✅ Event ticket purchases collection created');
    } catch (error) {
      if (error.code === 409) {
        console.log('⚠️ Event ticket purchases collection already exists');
      } else {
        throw error;
      }
    }

    // Create event_ticket_purchases attributes
    const purchaseAttributes = [
      { key: 'purchaseId', type: 'string', size: 30, required: true, description: 'Unique purchase reference (e.g., EVT-2024-001234)' },
      { key: 'eventTicketId', type: 'string', size: 50, required: true, description: 'Reference to event_tickets document' },
      { key: 'eventTicketTypeId', type: 'string', size: 50, required: true, description: 'Reference to event_ticket_types document' },
      { key: 'userId', type: 'string', size: 50, required: true, description: 'Appwrite user ID of purchaser' },
      { key: 'userEmail', type: 'string', size: 255, required: true, description: 'Purchaser email' },
      { key: 'userName', type: 'string', size: 255, required: true, description: 'Purchaser name' },
      { key: 'userPhone', type: 'string', size: 50, required: false, description: 'Purchaser phone number' },
      { key: 'quantity', type: 'integer', required: true, description: 'Number of tickets purchased' },
      { key: 'unitPrice', type: 'double', required: true, description: 'Price per ticket at time of purchase' },
      { key: 'subtotal', type: 'double', required: true, description: 'Quantity * unitPrice' },
      { key: 'taxAmount', type: 'double', required: false, default: 0, description: 'Tax amount' },
      { key: 'serviceFee', type: 'double', required: false, default: 0, description: 'Service fee amount' },
      { key: 'discountAmount', type: 'double', required: false, default: 0, description: 'Any discount applied' },
      { key: 'totalAmount', type: 'double', required: true, description: 'Final amount charged' },
      { key: 'currency', type: 'string', size: 10, required: false, default: 'KES', description: 'Currency code' },
      { key: 'paymentStatus', type: 'string', size: 20, required: false, default: 'pending', description: 'pending, paid, failed, refunded, cancelled' },
      { key: 'paymentMethod', type: 'string', size: 50, required: false, description: 'stripe, mpesa, paystack, manual, etc.' },
      { key: 'paymentReference', type: 'string', size: 100, required: false, description: 'External payment provider reference' },
      { key: 'paymentDetails', type: 'string', size: 5000, required: false, description: 'JSON string with payment provider response' },
      { key: 'status', type: 'string', size: 20, required: false, default: 'pending', description: 'pending, confirmed, cancelled, refunded' },
      { key: 'confirmationCode', type: 'string', size: 30, required: false, description: 'Unique confirmation code for ticket verification' },
      { key: 'tickets', type: 'string', size: 10000, required: false, description: 'JSON array of individual ticket codes/QR data' },
      { key: 'purchasedAt', type: 'datetime', required: true, description: 'When the purchase was made' },
      { key: 'paidAt', type: 'datetime', required: false, description: 'When payment was confirmed' },
      { key: 'cancelledAt', type: 'datetime', required: false, description: 'When purchase was cancelled' },
      { key: 'refundedAt', type: 'datetime', required: false, description: 'When purchase was refunded' },
      { key: 'notes', type: 'string', size: 2000, required: false, description: 'Admin notes' },
      { key: 'metadata', type: 'string', size: 5000, required: false, description: 'JSON string for additional data' }
    ];

    for (const attr of purchaseAttributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            DB_ID,
            EVENT_TICKET_PURCHASES_COLLECTION_ID,
            attr.key,
            attr.size,
            attr.required,
            attr.default,
            attr.array || false
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            DB_ID,
            EVENT_TICKET_PURCHASES_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(
            DB_ID,
            EVENT_TICKET_PURCHASES_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        } else if (attr.type === 'double') {
          await databases.createFloatAttribute(
            DB_ID,
            EVENT_TICKET_PURCHASES_COLLECTION_ID,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            DB_ID,
            EVENT_TICKET_PURCHASES_COLLECTION_ID,
            attr.key,
            attr.required,
            attr.default
          );
        }
        console.log(`✅ Created purchase attribute: ${attr.key}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️ Purchase attribute ${attr.key} already exists`);
        } else {
          console.error(`❌ Error creating purchase attribute ${attr.key}:`, error.message);
        }
      }
    }

    // Create storage bucket for ticket attachments (QR codes, PDF tickets, etc.)
    console.log('Creating event ticket attachments storage bucket...');
    try {
      await storage.createBucket(
        EVENT_TICKET_ATTACHMENTS_BUCKET_ID,
        'Event Ticket Attachments',
        [
          Permission.read(Role.users()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
          Permission.delete(Role.team('admins'))
        ],
        false, // Not file security
        true,  // Enabled
        10 * 1024 * 1024, // 10MB max file size
        ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'svg'], // Allowed file extensions
        'gzip', // Compression
        false,  // Not encryption
        false   // Not antivirus
      );
      console.log('✅ Event ticket attachments bucket created');
    } catch (error) {
      if (error.code === 409) {
        console.log('⚠️ Event ticket attachments bucket already exists');
      } else {
        console.error('❌ Error creating storage bucket:', error.message);
      }
    }

    // Create indexes for better performance
    console.log('Creating database indexes...');
    const indexes = [
      // Event Tickets indexes
      { collection: EVENT_TICKETS_COLLECTION_ID, key: 'eventId', type: 'unique', attributes: ['eventId'] },
      { collection: EVENT_TICKETS_COLLECTION_ID, key: 'eventSlug', type: 'key', attributes: ['eventSlug'] },
      { collection: EVENT_TICKETS_COLLECTION_ID, key: 'isActive', type: 'key', attributes: ['isActive'] },

      // Event Ticket Types indexes
      { collection: EVENT_TICKET_TYPES_COLLECTION_ID, key: 'eventTicketId', type: 'key', attributes: ['eventTicketId'] },
      { collection: EVENT_TICKET_TYPES_COLLECTION_ID, key: 'isActive', type: 'key', attributes: ['isActive'] },
      { collection: EVENT_TICKET_TYPES_COLLECTION_ID, key: 'sortOrder', type: 'key', attributes: ['sortOrder'] },

      // Event Ticket Purchases indexes
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'purchaseId', type: 'unique', attributes: ['purchaseId'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'userId', type: 'key', attributes: ['userId'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'eventTicketId', type: 'key', attributes: ['eventTicketId'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'eventTicketTypeId', type: 'key', attributes: ['eventTicketTypeId'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'paymentStatus', type: 'key', attributes: ['paymentStatus'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'status', type: 'key', attributes: ['status'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'confirmationCode', type: 'unique', attributes: ['confirmationCode'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'paymentReference', type: 'key', attributes: ['paymentReference'] },
      { collection: EVENT_TICKET_PURCHASES_COLLECTION_ID, key: 'purchasedAt', type: 'key', attributes: ['purchasedAt'] }
    ];

    for (const index of indexes) {
      try {
        await databases.createIndex(
          DB_ID,
          index.collection,
          index.key,
          index.type,
          index.attributes
        );
        console.log(`✅ Created index: ${index.key} on ${index.collection}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️ Index ${index.key} already exists on ${index.collection}`);
        } else {
          console.error(`❌ Error creating index ${index.key}:`, error.message);
        }
      }
    }

    console.log('🎉 Event Ticket system setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Event Tickets collection (configuration per event)');
    console.log('- Event Ticket Types collection (VIP, Regular, Early Bird, etc.)');
    console.log('- Event Ticket Purchases collection (user purchases)');
    console.log('- Storage bucket for QR codes and PDF tickets');
    console.log('- Database indexes for performance');
    console.log('\n🚀 Your event ticket system is ready to use!');

  } catch (error) {
    console.error('❌ Error setting up event ticket collections:', error);
    process.exit(1);
  }
}

// Run the setup
setupEventTicketCollections();