'use strict';
// Focused regression for the original "no next mission after battle" report.
process.argv.push('--legacy-only');
require('./verify-browser.cjs');
