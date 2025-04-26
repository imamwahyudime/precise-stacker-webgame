window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score');
    const highScoreDisplay = document.getElementById('highScore');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const finalScoreMessage = document.getElementById('finalScoreMessage');
    const restartButton = document.getElementById('restartButton');

    // --- Game Constants ---
    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;
    const BLOCK_HEIGHT = 20;
    const INITIAL_BLOCK_WIDTH = 100;
    const SWING_SPEED_START = 2;
    const SWING_SPEED_INCREASE = 0.05; // Speed increase per block
    const DROP_SPEED = 5;
    const CAMERA_FOLLOW_THRESHOLD = CANVAS_HEIGHT * 0.6; // When stack reaches 60% height

    // --- Game State Variables ---
    let score = 0;
    let highScore = localStorage.getItem('preciseStackerHighScore') || 0;
    let blocks = []; // Stores { x, y, width, height, color }
    let currentBlock = null; // The swinging/dropping block
    let swingSpeed = SWING_SPEED_START;
    let swingDirection = 1; // 1 for right, -1 for left
    let gameState = 'waiting'; // 'waiting', 'swinging', 'dropping', 'gameOver'
    let cameraY = 0; // Vertical offset for the camera/view
    let blockColorHue = 180; // Starting hue for block colors

    // --- Setup Canvas ---
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // --- Utility Functions ---
    function getRandomColor() {
        blockColorHue = (blockColorHue + 15) % 360; // Cycle through hues
        return `hsl(${blockColorHue}, 70%, 60%)`;
    }

    function drawBlock(block) {
        ctx.fillStyle = block.color;
        // Adjust y based on camera position
        ctx.fillRect(block.x, block.y - cameraY, block.width, block.height);
        ctx.strokeStyle = '#333'; // Add a subtle border
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x, block.y - cameraY, block.width, block.height);
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = `Score: ${score}`;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('preciseStackerHighScore', highScore);
        }
        highScoreDisplay.textContent = `High Score: ${highScore}`;
    }

    // --- Game Logic Functions ---
    function resetGame() {
        score = 0;
        blocks = [];
        currentBlock = null;
        swingSpeed = SWING_SPEED_START;
        swingDirection = 1;
        cameraY = 0; // Reset camera position
        gameOverOverlay.style.display = 'none'; // Hide overlay
        blockColorHue = 180; // Reset color cycle

        // Create the base block
        const baseWidth = CANVAS_WIDTH * 0.8; // Make base wider
        blocks.push({
            x: (CANVAS_WIDTH - baseWidth) / 2,
            y: CANVAS_HEIGHT - BLOCK_HEIGHT,
            width: baseWidth,
            height: BLOCK_HEIGHT,
            color: '#888' // Grey base
        });

        spawnNewBlock();
        updateScoreDisplay();
        gameState = 'swinging'; // Start the game immediately
        if (!animationFrameId) { // Avoid multiple loops if restart is rapid
             gameLoop();
        }
    }

    function spawnNewBlock() {
        const previousBlock = blocks[blocks.length - 1];
        currentBlock = {
            x: 0, // Start swinging from the left edge
            y: previousBlock.y - BLOCK_HEIGHT - 50, // Position above the stack
            width: previousBlock.width, // Width based on the last placed block
            height: BLOCK_HEIGHT,
            color: getRandomColor()
        };
        // Adjust initial Y if camera has moved
        if (currentBlock.y - cameraY < 50) {
             currentBlock.y = cameraY + 50;
        }
        swingDirection = 1; // Always start swinging right initially
    }

    function handleLanding() {
        const droppedBlock = currentBlock;
        const topBlock = blocks[blocks.length - 1];

        const overlapStart = Math.max(droppedBlock.x, topBlock.x);
        const overlapEnd = Math.min(droppedBlock.x + droppedBlock.width, topBlock.x + topBlock.width);
        const overlapWidth = overlapEnd - overlapStart;

        if (overlapWidth <= 0) {
            // Game Over - completely missed
            gameState = 'gameOver';
            finalScoreMessage.textContent = `Your Score: ${score}`;
            gameOverOverlay.style.display = 'flex'; // Show overlay
            cancelAnimationFrame(animationFrameId); // Stop the loop
            animationFrameId = null;
        } else {
            // Successful placement - Trim the block
            const newBlock = {
                x: overlapStart,
                y: topBlock.y - BLOCK_HEIGHT, // Place directly on top
                width: overlapWidth,
                height: BLOCK_HEIGHT,
                color: droppedBlock.color // Keep the color of the dropped block
            };
            blocks.push(newBlock);

            // Update score and difficulty
            score++;
            swingSpeed = SWING_SPEED_START + score * SWING_SPEED_INCREASE;
            updateScoreDisplay();

            // Adjust camera if stack is high
            if (newBlock.y < CAMERA_FOLLOW_THRESHOLD && blocks.length > 5) { // Don't move camera too early
                cameraY += BLOCK_HEIGHT;
            }

            // Spawn the next block and continue swinging
            spawnNewBlock();
            gameState = 'swinging';
        }
    }

    // --- Game Loop ---
    let animationFrameId = null;
    function gameLoop(timestamp) {
        if (gameState === 'gameOver') {
             animationFrameId = null; // Ensure loop stops
             return;
        }

        // Clear Canvas (taking camera into account is not needed for clearRect)
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Background (if needed, could be static CSS)
        // ctx.fillStyle = '#e0e8f0';
        // ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Update and Draw Blocks
        if (gameState === 'swinging') {
            currentBlock.x += swingDirection * swingSpeed;
            // Bounce off edges
            if (currentBlock.x < 0 || currentBlock.x + currentBlock.width > CANVAS_WIDTH) {
                swingDirection *= -1;
                // Clamp position to prevent sticking outside bounds
                currentBlock.x = Math.max(0, Math.min(currentBlock.x, CANVAS_WIDTH - currentBlock.width));
            }
            drawBlock(currentBlock);
        } else if (gameState === 'dropping') {
            const targetY = blocks[blocks.length - 1].y - BLOCK_HEIGHT;
            currentBlock.y += DROP_SPEED;

            if (currentBlock.y >= targetY) {
                currentBlock.y = targetY; // Snap to exact position
                handleLanding(); // Check overlap and proceed
                // Only draw if not game over immediately
                if (gameState !== 'gameOver') {
                    drawBlock(currentBlock); // Draw the just-landed block momentarily before next frame
                }
            } else {
                drawBlock(currentBlock); // Draw while falling
            }
        }

        // Draw all stacked blocks
        for (let i = blocks.length - 1; i >= 0; i--) {
             // Only draw blocks potentially visible within the camera view
             if (blocks[i].y - cameraY < CANVAS_HEIGHT && blocks[i].y + blocks[i].height - cameraY > 0) {
                drawBlock(blocks[i]);
             }
        }

        // Request next frame
        if (gameState !== 'gameOver') {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
             // Draw the final stack one last time when game ends
             ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
             for (let i = blocks.length - 1; i >= 0; i--) {
                if (blocks[i].y - cameraY < CANVAS_HEIGHT && blocks[i].y + blocks[i].height - cameraY > 0) {
                     drawBlock(blocks[i]);
                }
            }
        }
    }

    // --- Event Listeners ---
    function handleInput() {
        if (gameState === 'swinging') {
            gameState = 'dropping';
        }
    }

    canvas.addEventListener('click', handleInput);
    // Optional: Add touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling/zooming on mobile
        handleInput();
    }, { passive: false });

    restartButton.addEventListener('click', () => {
        resetGame(); // Reset variables and start gameLoop
    });

    // --- Initial Game Start ---
    resetGame(); // Set up the initial state
    // gameLoop() is called inside resetGame after setting gameState
};