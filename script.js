window.onload = () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score');
    const highScoreDisplay = document.getElementById('highScore');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const finalScoreMessage = document.getElementById('finalScoreMessage');
    const restartButton = document.getElementById('restartButton');

    // --- Error Handling for Canvas Context ---
    if (!ctx) {
        console.error("Failed to get 2D context from canvas. Game cannot start.");
        alert("Error: Could not initialize the game graphics.");
        return;
    }

    // --- Game Constants ---
    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 600;
    const BLOCK_HEIGHT = 20;
    const BASE_BLOCK_WIDTH_RATIO = 0.8; // Base block is 80% of canvas width
    const BASE_BLOCK_COLOR = '#888';
    const BLOCK_SPAWN_GAP = 50; // Vertical distance above stack block spawns
    const MIN_SPAWN_Y_OFFSET = 50; // Minimum distance from top of canvas block should spawn
    const BLOCK_BORDER_COLOR = '#333';
    const BLOCK_BORDER_WIDTH = 1;
    const SWING_SPEED_START = 2;
    const SWING_SPEED_INCREASE = 0.05; // Speed increase per block placed
    const DROP_SPEED = 5;
    const CAMERA_FOLLOW_THRESHOLD_RATIO = 0.6; // Camera adjusts when stack top is in the top 60% of the screen height
    const CAMERA_START_THRESHOLD_BLOCKS = 5; // Min blocks before camera starts moving
    const HUE_START = 180; // Starting HSL hue for block colors
    const HUE_INCREMENT = 15; // How much hue changes per block
    const HSL_SATURATION = '70%';
    const HSL_LIGHTNESS = '60%';

    // --- Game State Variables ---
    let score = 0;
    let highScore = localStorage.getItem('preciseStackerHighScore') || 0;
    let blocks = []; // Stores { x, y, width, height, color }
    let currentBlock = null; // The swinging/dropping block
    let swingSpeed = SWING_SPEED_START;
    let swingDirection = 1; // 1 for right, -1 for left
    let gameState = 'waiting'; // 'waiting', 'swinging', 'dropping', 'gameOver'
    let cameraY = 0; // Vertical offset for the camera/view (world Y coordinate at the top of the screen)
    let blockColorHue = HUE_START; // Current hue for block colors
    let animationFrameId = null; // ID for the animation frame request

    // --- Setup Canvas ---
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // --- Utility Functions ---
    function getRandomColor() {
        blockColorHue = (blockColorHue + HUE_INCREMENT) % 360; // Cycle through hues
        return `hsl(${blockColorHue}, ${HSL_SATURATION}, ${HSL_LIGHTNESS})`;
    }

    function drawBlock(block) {
        ctx.fillStyle = block.color;
        // Adjust y based on camera position
        const drawY = block.y - cameraY;
        ctx.fillRect(block.x, drawY, block.width, block.height);
        ctx.strokeStyle = BLOCK_BORDER_COLOR;
        ctx.lineWidth = BLOCK_BORDER_WIDTH;
        ctx.strokeRect(block.x, drawY, block.width, block.height);
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = `Score: ${score}`;
        if (score > highScore) {
            highScore = score;
            // Save high score to local storage
            try {
                localStorage.setItem('preciseStackerHighScore', highScore);
            } catch (e) {
                console.warn("Could not save high score to localStorage:", e);
            }
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
        blockColorHue = HUE_START; // Reset color cycle

        // Stop any existing game loop before starting anew
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Create the base block
        const baseWidth = CANVAS_WIDTH * BASE_BLOCK_WIDTH_RATIO;
        blocks.push({
            x: (CANVAS_WIDTH - baseWidth) / 2,
            y: CANVAS_HEIGHT - BLOCK_HEIGHT,
            width: baseWidth,
            height: BLOCK_HEIGHT,
            color: BASE_BLOCK_COLOR
        });

        spawnNewBlock();
        updateScoreDisplay();
        gameState = 'swinging'; // Start the game immediately
        gameLoop(); // Start the game loop
    }

    function spawnNewBlock() {
        const previousBlock = blocks[blocks.length - 1];
        let spawnY = previousBlock.y - BLOCK_HEIGHT - BLOCK_SPAWN_GAP;

        // Adjust initial Y if camera has moved, ensure it's not too close to the top edge (relative to camera)
        if (spawnY - cameraY < MIN_SPAWN_Y_OFFSET) {
             spawnY = cameraY + MIN_SPAWN_Y_OFFSET;
        }

        currentBlock = {
            x: 0, // Start swinging from the left edge
            y: spawnY,
            width: previousBlock.width, // Width based on the last placed block
            height: BLOCK_HEIGHT,
            color: getRandomColor()
        };
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
            gameState = 'gameOver'; // Set state, loop will handle the rest
            finalScoreMessage.textContent = `Your Score: ${score}`;
            gameOverOverlay.style.display = 'flex'; // Show overlay immediately
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

            // --- CAMERA FIX ---
            // Adjust camera if stack is high enough
            const screenThresholdY = CANVAS_HEIGHT * (1 - CAMERA_FOLLOW_THRESHOLD_RATIO); // Y-coordinate on screen for threshold
            // Check if the new block *would be drawn* above the threshold with the *current* cameraY
            if ((newBlock.y - cameraY < screenThresholdY) && blocks.length > CAMERA_START_THRESHOLD_BLOCKS) {
                 // Adjust cameraY so the new block is drawn AT the threshold
                 // As newBlock.y decreases (goes up in world), cameraY must also decrease (become more negative)
                 // to keep the draw position (newBlock.y - cameraY) constant at screenThresholdY.
                 cameraY = newBlock.y - screenThresholdY;
            }
            // --- END CAMERA FIX ---


            // Spawn the next block and continue swinging
            spawnNewBlock();
            gameState = 'swinging';
        }
    }

    // --- Game Loop ---
    function gameLoop() {
        // Schedule the next frame
        animationFrameId = requestAnimationFrame(gameLoop);

        // Clear Canvas
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // --- Draw all stacked blocks ---
        for (let i = blocks.length - 1; i >= 0; i--) {
             // Only draw blocks potentially visible within the camera view
             const blockDrawY = blocks[i].y - cameraY;
             if (blockDrawY < CANVAS_HEIGHT && blockDrawY + blocks[i].height > 0) {
                drawBlock(blocks[i]);
             }
        }

        // --- Update and Draw Current Block based on State ---
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
                handleLanding(); // Check overlap and update game state/camera
                // Draw the block only if game is not over yet
                if (gameState !== 'gameOver') {
                     drawBlock(currentBlock); // Draw the just-landed block
                }
            } else {
                drawBlock(currentBlock); // Draw while falling
            }
        } else if (gameState === 'gameOver') {
            // Game Over State
            cancelAnimationFrame(animationFrameId); // Stop the loop
            animationFrameId = null; // Clear the ID
            // Final draw is handled by drawing stacked blocks above before this check.
            // UI overlay is shown in handleLanding. Nothing more needed here.
            return; // Exit the game loop function
        }
    }

    // --- Event Listeners ---
    function handleInput() {
        if (gameState === 'swinging') {
            gameState = 'dropping';
        }
    }

    canvas.addEventListener('click', handleInput);
    // Add touch support
    canvas.addEventListener('touchstart', (e) => {
        if (gameState === 'swinging' || gameState === 'dropping') {
             e.preventDefault();
        }
        handleInput();
    }, { passive: false });

    restartButton.addEventListener('click', () => {
        gameOverOverlay.style.display = 'none';
        gameState = 'waiting';
        resetGame();
    });

    // --- Initial Game Start ---
    highScore = localStorage.getItem('preciseStackerHighScore') || 0;
    updateScoreDisplay();
    resetGame();
};