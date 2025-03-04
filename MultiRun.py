#!/usr/bin/env python3
import subprocess
import sys
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(f"sequential_runner_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("sequential_runner")

def run_script(script_path):
    """
    Run a Python script and stream its output to the terminal in real-time
    """
    if not os.path.exists(script_path):
        logger.error(f"Script not found: {script_path}")
        return False
    
    logger.info(f"Starting script: {script_path}")
    
    try:
        # Run the script with real-time output forwarding
        process = subprocess.Popen(
            [sys.executable, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1  # Line buffered
        )
        
        # Stream output in real-time
        while process.poll() is None:
            # Handle stdout
            stdout_line = process.stdout.readline()
            if stdout_line:
                print(stdout_line, end='')  # Print directly to terminal
            
            # Handle stderr
            stderr_line = process.stderr.readline()
            if stderr_line:
                print(stderr_line, end='', file=sys.stderr)  # Print to stderr
        
        # Get any remaining output
        stdout, stderr = process.communicate()
        if stdout:
            print(stdout, end='')
        if stderr:
            print(stderr, end='', file=sys.stderr)
        
        # Check exit code
        if process.returncode != 0:
            logger.error(f"Script failed with exit code {process.returncode}: {script_path}")
            return False
        
        logger.info(f"Successfully completed script: {script_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error running script {script_path}: {str(e)}")
        return False

def main():
    # List of scripts to run in order
    scripts = [
        "DB/Batch_requests/CompoundFormBatch.py",  # Fixed typo in extension (.py instead of ,py)
        "DB/Batch_requests/dosingBatch.py",
        "DB/Batch_requests/embeddings_gen.py",
    ]
    
    logger.info(f"Starting sequential execution of {len(scripts)} scripts")
    
    for i, script in enumerate(scripts, 1):
        logger.info(f"Running script {i}/{len(scripts)}: {script}")
        success = run_script(script)
        
        if not success:
            user_response = input(f"Script {script} failed. Continue? (y/n): ").lower()
            if user_response != 'y':
                logger.info("Execution stopped by user after script failure")
                break
    
    logger.info("Sequential execution completed")

if __name__ == "__main__":
    main()