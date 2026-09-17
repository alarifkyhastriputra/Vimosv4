sed -i 's/if (!selectedRecipient) {/if (!selectedRecipient \&\& activeTab !== "hengkur_ai") {/' components/Chat.tsx
