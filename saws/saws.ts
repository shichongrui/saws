#!/usr/bin/env ts-node

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { startDev } from './commands/dev';

yargs(hideBin(process.argv))
    .command('dev [entrypoint]', 'start dev', (yargs) => {
        return yargs.positional('entrypoint', {
            describe: 'entrypoint for your saws api',
        });
    }, (argv) => {
        startDev(argv.entrypoint as string);
    })
    .parse();