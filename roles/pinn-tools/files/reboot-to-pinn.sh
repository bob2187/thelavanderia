#!/bin/bash
# Reboot to PINN recovery environment

echo "Creating PINN trigger file..."
sudo touch /boot/firmware/PINN_TRIGGER 2>/dev/null || sudo touch /boot/PINN_TRIGGER 2>/dev/null

if [ $? -eq 0 ]; then
    echo "Trigger file created. Rebooting to PINN in 3 seconds..."
    echo "Press Ctrl+C to cancel."
    sleep 3
    sudo reboot
else
    echo "Error: Could not create trigger file."
    exit 1
fi
