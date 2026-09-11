// Entry point so `node --test tests/` works on every supported Node.
//
// Node 22 expands a directory argument and discovers `*.test.js` itself; Node 26 treats the
// argument as a file or glob and resolves a directory to its `index.js`. Importing each suite
// here satisfies both — it is not itself a test file, so default discovery never double-runs it.
import './bang-lines.test.js';
import './bay.test.js';
import './booking-swap.test.js';
import './bookings-overlay.test.js';
import './bookings.test.js';
import './cli.test.js';
import './commands.test.js';
import './fleet.test.js';
import './frontmatter.test.js';
import './inference.test.js';
import './inspection-gitignore.test.js';
import './picker.test.js';
import './repo.test.js';
import './waybill.test.js';
