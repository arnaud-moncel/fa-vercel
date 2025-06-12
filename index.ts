import type { SslMode } from '@forestadmin/datasource-sql';
import type { Schema } from './typings';

import 'dotenv/config';
import { createAgent } from '@forestadmin/agent';
import { createSqlDataSource, introspect } from '@forestadmin/datasource-sql';
import fs from 'fs';
import pg from 'pg';
import express from 'express';

const app = express();

export default (async () => {
  // Options to connect to the db (see above).
  const connectionOptions = {
    uri: process.env.DATABASE_URL,
    schema: process.env.DATABASE_SCHEMA,
    sslMode: process.env.DATABASE_SSL_MODE as SslMode,
  };
  const introspectionFilePath = `${__dirname}/my-database-introspection.json`;
  
  let introspection;
  try {
    // The introspection is JSON serializable. You can store it in a file.
    // Read it from the file if it exists.
    introspection = JSON.parse(fs.readFileSync(introspectionFilePath, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      // The file does not exist, we need to introspect the database.
      introspection = await introspect(connectionOptions);
      fs.writeFileSync(introspectionFilePath, JSON.stringify(introspection));
    } else {
      throw e;
    }
  }
  
  // This object allows to configure your Forest Admin panel
  const agent = createAgent<Schema>({
    // Security tokens
    authSecret: process.env.FOREST_AUTH_SECRET!,
    envSecret: process.env.FOREST_ENV_SECRET!,
    forestServerUrl: process.env.FOREST_SERVER_URL!,
  
    // Make sure to set NODE_ENV to 'production' when you deploy your project
    isProduction: process.env.NODE_ENV === 'production',
    schemaPath: `${__dirname}/.forestadmin-schema.json`,
  
    // Autocompletion of collection names and fields
    typingsPath: './typings.ts',
    typingsMaxDepth: 5,
  });
  
  // Connect your datasources
  // All options are documented at https://docs.forestadmin.com/developer-guide-agents-nodejs/data-sources/connection
  agent.addDataSource(
    createSqlDataSource({ ...connectionOptions,
      dialect: 'postgres',
      dialectModule: pg,
    }, { introspection }),
  );
  
  // Expose an HTTP endpoint.
  agent.mountOnExpress(app);
  
  // Start the agent.
  try {
    await agent.start();
    app.listen(Number(process.env.APPLICATION_PORT), () => {
      console.log('server running');
    });
  } catch (error) {
    console.error('\x1b[31merror:\x1b[0m Forest Admin agent failed to start\n');
    console.error('');
    console.error(error.stack);
    process.exit(1);
  }
})();
